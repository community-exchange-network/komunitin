import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import { http, HttpResponse } from 'msw'
import type { Express } from 'express'
import { config } from '../../src/config'
import { privilegedDb } from '../../src/server/multitenant'
import prisma from '../../src/utils/prisma'
import { Prisma } from '../../src/generated/prisma/client'
import { auth, signJwt, signServiceJwt } from '../mocks/auth'
import { getNotificationsEvents, seedAccountingAccount, seedAccountingCurrency } from '../mocks/handlers'
import { resetDb, seedCategory, seedGroup } from '../mocks/seed'
import { server, setupTestServer, teardownTestServer } from '../mocks/server'
import { getS3UploadCount, getS3UploadRequests } from '../mocks/s3'
import { mutateCsv, removeCsvRow, zipFromFiles } from './migration-bundle-helpers'
import { accountingProgress, eventsFrom, ids, migrationFiles, migrationMocks, passwordHash, timestamp } from './migration-api-helpers'

let app: Express
let resetMocks: () => void
let token: string
let mocks: ReturnType<typeof migrationMocks>
const db = privilegedDb(prisma)
const upload = async (files = migrationFiles(), bearer = token) => request(app).post('/migrations')
  .set('Authorization', `Bearer ${bearer}`).set('Content-Type', 'application/zip').send(await zipFromFiles(files)).expect(200)
const migration = (response: { headers: Record<string, string> }) => prisma.migration.findUniqueOrThrow({ where: { id: response.headers['x-migration-id'] } })

before(async () => { ({ app, resetMocks } = await setupTestServer()) })
after(async () => { await teardownTestServer(); await prisma.$disconnect() })
beforeEach(async () => {
  server.resetHandlers()
  resetMocks()
  await resetDb()
  const admin = await auth('superadmin', 'superadmin@example.org', 'superadmin')
  token = await signJwt(admin.id, admin.email, 'superadmin', { includeDefaultScopes: false })
  mocks = migrationMocks()
})

test('migration endpoints require a superadmin user and reject ordinary users and service tokens', async () => {
  const user = await auth('ordinary')
  for (const path of ['/migrations', `/migrations/${ids.group}`, `/migrations/${ids.group}/events`]) {
    await request(app).get(path).expect(401)
    await request(app).get(path).set('Authorization', `Bearer ${user.token}`).expect(403)
  }
  const service = await signServiceJwt('komunitin-social', ['social:read', 'superadmin'])
  await request(app).post('/migrations').set('Authorization', `Bearer ${service}`).expect(403)
  await request(app).post('/migrations').set('Authorization', `Bearer ${user.token}`).expect(403)
  await request(app).post('/migrations').set('Authorization', `Bearer ${token}`).send({}).expect(400)
  assert.equal(await prisma.migration.count(), 0)
})

test('imports every Social resource and delegates only accounting CSVs and resolved identities to Accounting', async () => {
  const response = await upload()
  assert.equal((await migration(response)).status, 'completed', response.text)
  const group = await db.group.findUniqueOrThrow({ where: { id: ids.group } })
  assert.equal(group.currencyId, ids.currency)
  assert.equal(group.created.toISOString(), timestamp)
  assert.equal(group.updated.toISOString(), timestamp)
  assert.deepEqual(group.address, { addressLocality: 'Barcelona', addressCountry: 'ES' })
  assert.equal((group.settings as any).defaultGroupEmailFrequency, 'monthly')
  const member = await db.member.findUniqueOrThrow({ where: { id: ids['bob-member'] } })
  assert.equal(member.status, 'disabled')
  assert.equal(member.accountId, ids['bob-account'])
  const offer = await db.post.findUniqueOrThrow({ where: { id: ids.offer } })
  assert.equal(offer.status, 'published')
  assert.equal(offer.memberId, member.id)
  assert.equal(offer.updated.toISOString(), timestamp)
  assert.deepEqual(offer.data, { value: '5 credits' })
  assert.equal((offer.images as any[]).length, 2)
  assert.equal((offer.images as any[])[0].url, (offer.images as any[])[1].url)
  for (const upload of getS3UploadRequests()) {
    assert.equal(upload.ACL, 'public-read')
    assert.equal(upload.ContentType, 'image/png')
    assert.match(upload.Key!, /\/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/)
  }
  const need = await db.post.findUniqueOrThrow({ where: { id: ids.need } })
  assert.deepEqual(need.images, [])
  assert.deepEqual(need.data, { fulfilled: '2025-02-01T09:00:00.000Z' })
  assert.equal(need.expires!.toISOString(), '2025-03-01T09:00:00.000Z')
  const memberships = await db.memberUser.findMany({ orderBy: { memberId: 'asc' } })
  assert.deepEqual(memberships.find(row => row.userId === ids.alice)!.settings,
    { notifications: { myAccount: false, group: true }, emails: { myAccount: true, group: 'weekly' } })
  assert.equal((memberships.find(row => row.userId === ids.bob)!.settings as any).emails.group, 'monthly')
  assert.deepEqual((await db.category.findUniqueOrThrow({ where: { id: ids.category } })).meta, { description: 'Local food' })
  assert.equal(await db.groupAdminUser.count(), 1)
  assert.equal(await db.member.count(), 2)
  assert.equal(await db.user.count(), 4)
  assert.ok(mocks.authImports[0].every(user => user.passwordHash === passwordHash))
  assert.deepEqual(Object.keys(mocks.accountingImports[0].files).sort(), ['accounts.csv', 'currency.csv'])
  assert.deepEqual(mocks.accountingImports[0].users, mocks.authImports[0].map(({ id, email }) => ({ id, email })))
  assert.ok(!JSON.stringify(mocks.accountingImports).includes(passwordHash))
  assert.equal(getNotificationsEvents().length, 0)
  assert.equal(eventsFrom(response.text).filter(event => event.level === 'warn' && event.step === 'images').length, 2)
  assert.ok(!response.text.includes(passwordHash))
  assert.ok(!JSON.stringify(await prisma.migration.findMany({ include: { events: true } })).includes(passwordHash))
})

test('creates missing Accounting resources using Auth identities and links them to Social', async () => {
  resetMocks()
  let files = migrationFiles()
  for (const row of [1, 2, 3]) files = mutateCsv(files, 'users.csv', row, 'id', '')
  files.set('currency.csv', Buffer.from(
    'code,adminUser,name,namePlural,symbol,decimals,scale,rateNumerator,rateDenominator\n'
    + 'EXMP,admin@example.org,Credit,Credits,C,2,2,1,1\n',
  ))
  files.set('accounts.csv', Buffer.from('code,balance\nEXMP0001,0\nEXMP0002,0\n'))

  server.use(http.post(`${config.ACCOUNTING_URL}/migrations`, async ({ request }) => {
    const input = await request.json() as typeof mocks.accountingImports[number]
    mocks.accountingImports.push(input)
    const users = new Map(input.users.map(user => [user.email, user.id]))
    seedAccountingCurrency('EXMP', ids.currency, 'active', [users.get('admin@example.org')!])
    seedAccountingAccount('EXMP', 'EXMP0001', [users.get('alice@example.org')!], ids['alice-account'])
    seedAccountingAccount('EXMP', 'EXMP0002', [users.get('bob@example.org')!], ids['bob-account'], 'disabled')
    return new HttpResponse(accountingProgress([]), {
      headers: { 'Content-Type': 'text/event-stream', 'X-Migration-Id': ids.group },
    })
  }))

  const response = await upload(files)
  assert.equal((await migration(response)).status, 'completed', response.text)
  const group = await db.group.findUniqueOrThrow({ where: { id: ids.group } })
  const member = await db.member.findUniqueOrThrow({ where: { id: ids['alice-member'] } })
  const membership = await db.memberUser.findFirstOrThrow({
    where: { memberId: member.id },
    include: { user: true },
  })
  const alice = mocks.accountingImports[0].users.find(user => user.email === 'alice@example.org')!
  assert.equal(group.currencyId, ids.currency)
  assert.equal(member.accountId, ids['alice-account'])
  assert.equal(membership.user.id, alice.id)
  assert.equal(membership.user.email, alice.email)
})

test('forwards and replays Accounting progress across split UTF-8 chunks and heartbeats', async () => {
  const logs = [
    { level: 'info', step: 'start', message: 'Importació iniciada' },
    { level: 'warn', step: 'accounts', message: 'Account warning' },
    { level: 'info', step: 'complete', message: 'Accounting completed' },
  ]
  server.use(http.post(`${config.ACCOUNTING_URL}/migrations`, ({ request }) => {
    assert.equal(request.headers.get('authorization'), 'Bearer social-service-token')
    assert.equal(request.headers.get('accept'), 'text/event-stream')
    const bytes = new TextEncoder().encode(`: heartbeat\n\n${accountingProgress(logs)}`)
    return new HttpResponse(new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
        controller.close()
      },
    }), { headers: { 'Content-Type': 'text/event-stream', 'X-Migration-Id': ids.group } })
  }))
  const response = await upload()
  const attempt = await migration(response)
  assert.equal(attempt.status, 'completed', response.text)
  const expected = logs.map(log => ({ ...log, step: `accounting:${log.step}` }))
  const forwarded = (events: { level: string, step: string, message: string }[]) => events
    .filter(event => event.step.startsWith('accounting:')).map(({ level, step, message }) => ({ level, step, message }))
  assert.deepEqual(forwarded(eventsFrom(response.text)), expected)
  const replay = await request(app).get(`/migrations/${attempt.id}/events`).set('Authorization', `Bearer ${token}`).expect(200)
  assert.deepEqual(forwarded(eventsFrom(replay.text)), expected)
})

test('preserves Accounting error logs and fails on a failed or incomplete stream', async () => {
  for (const status of ['failed', null]) {
    server.use(http.post(`${config.ACCOUNTING_URL}/migrations`, () => new HttpResponse(
      accountingProgress([{ level: 'error', step: 'failed', message: 'Accounting problem' }], status),
      { headers: { 'Content-Type': 'text/event-stream', 'X-Migration-Id': ids.group } },
    )))
    const response = await upload()
    assert.equal((await migration(response)).status, 'failed')
    assert.match(response.text, /Accounting problem/)
    assert.equal(await db.group.count(), 0)
  }
})

test('forwards accounting fields unchanged and reports validation failures from Accounting', async () => {
  const files = migrationFiles()
  files.set('currency.csv', Buffer.from(`id,code,scale,settings.future,stellarIssuerSecret\n${ids.currency},EXMP,invalid,opaque,private-secret\n`))
  files.set('accounts.csv', Buffer.from(`id,code,balance\n${ids['alice-account']},EXMP0001,invalid\n${ids['bob-account']},EXMP0002,invalid\n`))
  files.set('transfers.csv', Buffer.from('payer,payee,amount\nmissing,missing,invalid\n'))
  let received: unknown
  server.use(http.post(`${config.ACCOUNTING_URL}/migrations`, async ({ request }) => {
    received = await request.json()
    return HttpResponse.json({ errors: [{ detail: 'Invalid currency scale' }] }, { status: 400 })
  }))
  const response = await upload(files)
  assert.equal((await migration(response)).status, 'failed')
  assert.deepEqual((received as { files: Record<string, string> }).files, Object.fromEntries(
    (['currency.csv', 'accounts.csv', 'transfers.csv'] as const).map(name => [name, files.get(name)!.toString()]),
  ))
  assert.match(response.text, /Accounting import: Invalid currency scale/)
  assert.ok(!response.text.includes('private-secret'))
  assert.equal(await db.group.count(), 0)
  assert.equal(await db.member.count(), 0)
})

test('retry preserves existing values, fills omitted images in source order, and reuses S3 objects and File rows', async () => {
  await upload()
  const group = await db.group.update({ where: { id: ids.group }, data: { name: 'Edited after import' } })
  const user = await db.user.update({ where: { id: ids.alice }, data: { name: 'New name' } })
  const membership = await db.memberUser.update({ where: { id: ids.membership }, data: { settings: { emails: { group: 'never' } } } })
  const uploads = getS3UploadCount()
  mocks.fixImages()
  const result = await upload()
  assert.equal((await migration(result)).status, 'completed', result.text)
  assert.deepEqual(await db.group.findUniqueOrThrow({ where: { id: ids.group } }), group)
  assert.deepEqual(await db.user.findUniqueOrThrow({ where: { id: ids.alice } }), user)
  assert.deepEqual(await db.memberUser.findUniqueOrThrow({ where: { id: ids.membership } }), membership)
  assert.equal(await db.group.count(), 1)
  assert.equal(await db.member.count(), 2)
  assert.equal(await db.post.count(), 2)
  assert.equal(await db.file.count(), 4)
  assert.equal(getS3UploadCount(), uploads + 2)
  const post = await db.post.findUniqueOrThrow({ where: { id: ids.offer } })
  assert.equal((post.images as any[]).length, 3)
  assert.equal((post.images as any[])[0].url, (post.images as any[])[2].url)
  assert.equal(post.updated.toISOString(), timestamp)
  const file = await db.file.findFirstOrThrow({ where: { resourceId: ids['alice-member'] } })
  assert.equal(file.uploaderId, ids.alice)
  await upload()
  assert.equal(getS3UploadCount(), uploads + 2)
  assert.equal(await db.file.count(), 4)
})

test('adds pictures on re-upload to offers and needs originally imported without images', async () => {
  let files = mutateCsv(migrationFiles(), 'posts.csv', 1, 'imageUrls', '')
  await upload(files)
  for (const row of [1, 2]) files = mutateCsv(files, 'posts.csv', row, 'imageUrls', 'https://images.test/new.png')
  const response = await upload(files)
  assert.equal((await migration(response)).status, 'completed', response.text)
  const reader = await signJwt(ids.admin, 'admin@example.org', 'superadmin')
  for (const id of [ids.offer, ids.need]) {
    const { body } = await request(app).get(`/EXMP/posts/${id}`).set('Authorization', `Bearer ${reader}`).expect(200)
    assert.equal(body.data.attributes.images.length, 1)
    assert.equal(body.data.attributes.updated, timestamp)
  }
})

test('uses detected image extensions and recovers an uploaded object without its File row or source', async () => {
  const source = 'https://images.test/download.jpg'
  const files = mutateCsv(migrationFiles(), 'community.csv', 1, 'imageUrl', source)
  const first = await upload(files)
  assert.equal((await migration(first)).status, 'completed', first.text)
  const original = await db.file.findFirstOrThrow({ where: { resourceId: ids.group } })
  assert.match(original.key, /\.png$/)
  const uploads = getS3UploadCount()

  // Reproduce a crash after the S3 write but before the File row and image event were saved.
  await db.file.delete({ where: { id: original.id } })
  await db.group.update({ where: { id: ids.group }, data: { image: Prisma.DbNull } })
  await db.migrationEvent.deleteMany({ where: {
    step: 'images', data: { path: ['resourceId'], equals: ids.group },
  } })
  server.use(http.get(source, () => new HttpResponse(null, { status: 404 })))

  const retry = await upload(files)
  assert.equal((await migration(retry)).status, 'completed', retry.text)
  const recovered = await db.file.findFirstOrThrow({ where: { resourceId: ids.group } })
  assert.equal(recovered.key, original.key)
  assert.equal(recovered.url, original.url)
  assert.deepEqual((await db.group.findUniqueOrThrow({ where: { id: ids.group } })).image, { url: original.url })
  assert.equal(getS3UploadCount(), uploads)
})

test('corrected image URLs unlink replaced files and relink them when restored on retry', async () => {
  await upload()
  const original = await db.file.findFirstOrThrow({ where: { resourceId: ids.group } })
  const uploads = getS3UploadCount()
  const corrected = mutateCsv(migrationFiles(), 'community.csv', 1, 'imageUrl', 'https://images.test/replacement.png')
  const response = await upload(corrected)
  assert.equal((await migration(response)).status, 'completed', response.text)
  const replacement = await db.file.findFirstOrThrow({ where: { resourceId: ids.group } })
  assert.notEqual(replacement.id, original.id)
  assert.equal((await db.file.findUniqueOrThrow({ where: { id: original.id } })).resourceId, null)
  assert.deepEqual((await db.group.findUniqueOrThrow({ where: { id: ids.group } })).image, { url: replacement.url })

  const retry = await upload()
  assert.equal((await migration(retry)).status, 'completed', retry.text)
  assert.equal((await db.file.findUniqueOrThrow({ where: { id: original.id } })).resourceId, ids.group)
  assert.equal((await db.file.findUniqueOrThrow({ where: { id: replacement.id } })).resourceId, null)
  assert.deepEqual((await db.group.findUniqueOrThrow({ where: { id: ids.group } })).image, { url: original.url })
  assert.equal(getS3UploadCount(), uploads + 1)
})

test('fails missing Accounting and identity conflicts without writing Accounting; a corrected re-upload succeeds', async () => {
  seedAccountingCurrency('EXMP', ids.admin)
  const failed = await upload()
  assert.equal((await migration(failed)).status, 'failed')
  assert.match(failed.text, /Currency EXMP/)
  assert.equal(mocks.authImports.length, 0)
  assert.equal(await db.group.count(), 0)
  seedAccountingCurrency('EXMP', ids.currency)
  seedAccountingAccount('EXMP', 'EXMP0001', [ids.bob], ids['alice-account'])
  const ownerConflict = await upload()
  assert.match(ownerConflict.text, /conflicts with accounting/)
  seedAccountingAccount('EXMP', 'EXMP0001', [ids.alice], ids['alice-account'])
  const success = await upload()
  assert.equal((await migration(success)).status, 'completed')
})

test('rejects natural-key/UUID collisions, preserves existing communities, and leaves append-only failure events', async () => {
  const original = await seedGroup({ tenantId: 'EXMP', id: ids.admin, currencyId: ids.currency, name: 'Existing' })
  const response = await upload()
  assert.equal((await migration(response)).status, 'failed')
  assert.match(response.text, /Community EXMP: conflicting UUID/)
  assert.deepEqual(await db.group.findUniqueOrThrow({ where: { id: original.id } }), original)
  const corrected = mutateCsv(migrationFiles(), 'community.csv', 1, 'id', ids.admin)
  const retry = await upload(corrected)
  assert.equal((await migration(retry)).status, 'completed', retry.text)
  assert.deepEqual(await db.group.findUniqueOrThrow({ where: { id: original.id } }), original)
  assert.ok(await prisma.migrationEvent.count({ where: { migrationId: response.headers['x-migration-id'], level: 'error' } }))
})

test('invalid bundles have durable diagnostics without credentials and no domain side effects', async () => {
  const files = mutateCsv(migrationFiles(), 'users.csv', 1, 'passwordHash', 'a-secret-plaintext-password')
  const response = await upload(files)
  assert.equal((await migration(response)).status, 'failed')
  assert.match(response.text, /INVALID_PASSWORD_HASH/)
  assert.ok(!response.text.includes('a-secret-plaintext-password'))
  assert.equal(await db.group.count(), 0)
  assert.equal(mocks.authImports.length, 0)
})

test('rejects mismatched accounting codes before importing identities or social records', async () => {
  for (const [file, value, error] of [
    ['currency.csv', 'OTHR', 'CURRENCY_CODE_MISMATCH'],
    ['accounts.csv', 'EXMP9999', 'MISSING_REFERENCE'],
  ] as const) {
    const response = await upload(mutateCsv(migrationFiles(), file, 1, 'code', value))
    assert.equal((await migration(response)).status, 'failed')
    assert.ok(response.text.includes(error), response.text)
    assert.ok(response.text.includes(file), response.text)
    assert.equal(await db.group.count(), 0)
    assert.equal(await db.member.count(), 0)
    assert.equal(mocks.authImports.length, 0)
  }
})

test('continues after HTTP disconnect, rejects a simultaneous migration, and supports event replay cursors', async () => {
  const gate = Promise.withResolvers<void>()
  mocks.pauseAuth(gate.promise)
  const listener = app.listen(0)
  await once(listener, 'listening')
  const address = listener.address() as { port: number }
  try {
    const response = await fetch(`http://localhost:${address.port}/migrations`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/zip' },
      body: new Uint8Array(await zipFromFiles(migrationFiles())),
    })
    const id = response.headers.get('x-migration-id')!
    await response.body!.cancel()
    for (let i = 0; i < 100 && !mocks.authImports.length; i++) await setTimeout(20)
    assert.equal(mocks.authImports.length, 1)
    const concurrent = await upload()
    assert.equal((await migration(concurrent)).status, 'failed')
    assert.match(concurrent.text, /already has a running migration/)
    gate.resolve()
    const replay = await request(app).get(`/migrations/${id}/events`).set('Authorization', `Bearer ${token}`).expect(200)
    assert.match(replay.text, /"status":"completed"/)
    assert.equal(await db.group.count(), 1)
    const events = eventsFrom(replay.text)
    const cursor = events[2].id
    const after = await request(app).get(`/migrations/${id}/events`).set('Last-Event-ID', String(cursor)).set('Authorization', `Bearer ${token}`).expect(200)
    assert.ok(eventsFrom(after.text).every(event => event.id > cursor))
    assert.equal(eventsFrom(after.text).length, events.length - 3)
    await request(app).get(`/migrations/${id}`).set('Authorization', `Bearer ${token}`).expect(200)
  } finally {
    gate.resolve()
    listener.closeAllConnections()
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()))
  }
})

test('a re-upload marks a stopped worker failed and completes the community', async () => {
  const stopped = await prisma.migration.create({ data: { requestedBy: ids.admin, code: 'EXMP' } })
  const retry = await upload()
  assert.equal((await migration(retry)).status, 'completed', retry.text)
  assert.equal((await prisma.migration.findUniqueOrThrow({ where: { id: stopped.id } })).status, 'failed')
  assert.ok(await prisma.migrationEvent.findFirst({ where: { migrationId: stopped.id, step: 'interrupted' } }))
})


test('a partial import can be fixed and retried after a cross-community UUID collision', async () => {
  await seedGroup({ tenantId: 'OTHR' })
  const foreign = await seedCategory({ tenantId: 'OTHR', id: ids.category, code: 'foreign', name: 'Foreign category' })
  const failed = await upload()
  assert.equal((await migration(failed)).status, 'failed')
  assert.match(failed.text, /Category food: conflicting UUID/)
  assert.equal(await db.member.count({ where: { tenantId: 'EXMP' } }), 2)
  assert.equal(await db.post.count(), 0)
  const fixed = mutateCsv(migrationFiles(), 'categories.csv', 1, 'id', '')
  const retry = await upload(fixed)
  assert.equal((await migration(retry)).status, 'completed', retry.text)
  assert.equal(await db.member.count({ where: { tenantId: 'EXMP' } }), 2)
  assert.equal(await db.category.count(), 2)
  assert.equal(await db.post.count(), 2)
  assert.deepEqual(await db.category.findUniqueOrThrow({ where: { id: foreign.id } }), foreign)
})

test('preserves manually removed images while retrying other failed downloads', async () => {
  await upload()
  const group = await db.group.update({ where: { id: ids.group }, data: { image: Prisma.DbNull } })
  const post = await db.post.update({ where: { id: ids.offer }, data: { images: [] } })
  mocks.fixImages()
  const response = await upload()
  assert.equal((await migration(response)).status, 'completed', response.text)
  assert.deepEqual(await db.group.findUniqueOrThrow({ where: { id: ids.group } }), group)
  assert.deepEqual(await db.post.findUniqueOrThrow({ where: { id: ids.offer } }), post)
  assert.ok((await db.member.findUniqueOrThrow({ where: { id: ids['alice-member'] } })).image)
})

test('resolves code-only Accounting references, infers user UUIDs, and reuses generated Social resource UUIDs', async () => {
  let files = migrationFiles()
  files.set('currency.csv', Buffer.from('code\nEXMP\n'))
  files.set('accounts.csv', Buffer.from('code\nEXMP0001\nEXMP0002\n'))
  for (const [file, rows] of [
    ['community.csv', [1]], ['users.csv', [1, 2, 3]], ['members.csv', [1, 2]],
    ['member-users.csv', [1]], ['categories.csv', [1]], ['posts.csv', [1, 2]],
  ] as const) {
    for (const row of rows) files = mutateCsv(files, file, row, 'id', '')
  }
  const response = await upload(files)
  assert.equal((await migration(response)).status, 'completed', response.text)
  assert.equal(mocks.authImports[0].find(user => user.email === 'alice@example.org')!.id, ids.alice)
  const group = await db.group.findUniqueOrThrow({ where: { tenantId: 'EXMP' } })
  assert.equal(group.currencyId, ids.currency)
  assert.equal((await db.member.findUniqueOrThrow({ where: { tenantId_code: { tenantId: 'EXMP', code: 'EXMP0001' } } })).accountId, ids['alice-account'])
  assert.notEqual(group.id, ids.group)
  const retry = await upload(files)
  assert.equal((await migration(retry)).status, 'completed', retry.text)
  assert.deepEqual(await db.group.findUniqueOrThrow({ where: { tenantId: 'EXMP' } }), group)
  assert.equal(await db.member.count(), 2)
  assert.equal(await db.user.count(), 4)
})

test('pending members need no accounting account and deleted members keep the deletion timestamp', async () => {
  let files = mutateCsv(migrationFiles(), 'members.csv', 1, 'status', 'pending')
  files = removeCsvRow(files, 'accounts.csv', 1)
  files = mutateCsv(files, 'members.csv', 2, 'status', 'deleted')
  seedAccountingAccount('EXMP', 'EXMP0002', [ids.bob], ids['bob-account'], 'deleted')
  const response = await upload(files)
  assert.equal((await migration(response)).status, 'completed', response.text)
  assert.equal((await db.member.findUniqueOrThrow({ where: { id: ids['alice-member'] } })).accountId, null)
  const deleted = await db.member.findUniqueOrThrow({ where: { id: ids['bob-member'] } })
  assert.equal(deleted.accountId, ids['bob-account'])
  assert.equal(deleted.deleted!.toISOString(), timestamp)
  assert.equal(deleted.updated.toISOString(), timestamp)
})
