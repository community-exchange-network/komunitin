import assert from 'node:assert/strict'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'
import { after, before, beforeEach, test } from 'node:test'
import request from 'supertest'
import type { Express } from 'express'
import { privilegedDb } from '../../src/server/multitenant'
import prisma from '../../src/utils/prisma'
import { Prisma } from '../../src/generated/prisma/client'
import { auth, signJwt, signServiceJwt } from '../mocks/auth'
import { getAccountingRequests, getNotificationsEvents, seedAccountingAccount, seedAccountingCurrency } from '../mocks/handlers'
import { resetDb, seedCategory, seedGroup } from '../mocks/seed'
import { server, setupTestServer, teardownTestServer } from '../mocks/server'
import { getS3UploadCount } from '../mocks/s3'
import { mutateCsv, zipFromFiles } from './migration-bundle-helpers'
import { eventsFrom, ids, migrationFiles, migrationMocks, passwordHash, timestamp } from './migration-api-helpers'

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

test('imports every Social resource, preserves timestamps and credentials, maps frequencies, and only reads Accounting', async () => {
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
  const need = await db.post.findUniqueOrThrow({ where: { id: ids.need } })
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
  assert.ok(getAccountingRequests().every(entry => entry.method === 'GET' && entry.authorization === 'Bearer social-service-token'))
  assert.equal(getNotificationsEvents().length, 0)
  assert.equal(eventsFrom(response.text).filter(event => event.level === 'warn' && event.step === 'images').length, 2)
  assert.ok(!response.text.includes(passwordHash))
  assert.ok(!JSON.stringify(await prisma.migration.findMany({ include: { events: true } })).includes(passwordHash))
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

test('infers missing user UUIDs from sole accounting ownership and reuses generated Social resource UUIDs', async () => {
  let files = migrationFiles()
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
  assert.notEqual(group.id, ids.group)
  const retry = await upload(files)
  assert.equal((await migration(retry)).status, 'completed', retry.text)
  assert.deepEqual(await db.group.findUniqueOrThrow({ where: { tenantId: 'EXMP' } }), group)
  assert.equal(await db.member.count(), 2)
  assert.equal(await db.user.count(), 4)
})

test('pending members need no accounting account and deleted members keep the deletion timestamp', async () => {
  let files = mutateCsv(migrationFiles(), 'members.csv', 1, 'status', 'pending')
  files = mutateCsv(files, 'members.csv', 1, 'account.id', '')
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
