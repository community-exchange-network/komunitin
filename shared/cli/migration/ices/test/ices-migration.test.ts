import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { createAllIcesMigrationBundles, createIcesMigrationBundle } from '../index'
import { parseMigrationBundle, MIGRATION_PARSER_LIMITS } from '../../../../../social/src/features/migrations/bundle'
import { loadMigrationBundle } from '../../../../../social/src/features/migrations/bundle/container'
import { CSV_HEADERS } from '../../../../../social/src/features/migrations/bundle/csv'
import { icesId, serveIces } from './mocks/ices'
import { encodeCsv, mutateCsv, omitBlankColumns, resultCodes, zipFromFiles } from '../../../../../social/test/migration/migration-bundle-helpers'

test('exports legacy auth/social HTTP resources to a valid CSV ZIP without querying accounting', async (t) => {
  const fixture = await serveIces(t)
  const result = await createIcesMigrationBundle({
    url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' }, pageSize: 2,
  })
  const parsed = await parseMigrationBundle({ type: 'zip', bytes: result.bytes })
  assert.ok(parsed.success, JSON.stringify(parsed))
  assert.deepEqual(result.summary, parsed.summary)
  const { plan } = parsed
  assert.deepEqual(result.summary, { users: 6, memberUsers: 6, members: 6, accounts: 0, transfers: 0,
    categories: 2, offers: 3, needs: 1, images: 12 })
  assert.equal(plan.community.currency, null)
  assert.equal(plan.community.id, icesId(1))
  assert.equal(plan.community.currencyId, icesId(2))
  assert.equal(plan.community.status, 'disabled')
  assert.equal(plan.community.settings.terms, 'Terms, with a "quote"\nand a new line')
  assert.equal(plan.community.settings.minOffers, 1)
  assert.equal(plan.community.address?.locality, 'Manresa')
  assert.deepEqual(plan.community.location, { type: 'Point', longitude: 1.82, latitude: 41.72 })
  assert.equal(plan.users[1].id, icesId(201))
  assert.equal(plan.users[1].language, 'ca')
  assert.equal(plan.users[1].passwordHash, null)
  assert.equal(plan.users[1].status, null)
  assert.equal(plan.users[1].createdAt, null)
  assert.equal(plan.memberUsers[0].user, plan.memberUsers[1].user)
  assert.equal(plan.memberUsers[1].emails.group, 'daily')
  assert.equal(plan.memberUsers[2].emails.group, 'quarterly')
  assert.deepEqual(plan.members.map(({ status }) => status), ['draft', 'pending', 'active', 'disabled', 'suspended', 'deleted'])
  assert.ok(plan.members.every(({ account }) => account === null))
  assert.equal(plan.members[0].accountId, null)
  assert.ok(plan.members[0].contacts.some(({ type, value }) => type === 'twitter' && value === '@legacy'))
  assert.equal(plan.members[2].accountId, icesId(502))
  assert.deepEqual(plan.members[2].contacts, [{ type: 'email', value: 'member2@example.org' }])
  assert.equal(plan.posts[0].description, 'Description, "quoted"\nnext line')
  assert.equal(plan.posts[0].value, '2 hours')
  assert.equal(plan.posts[0].status, 'hidden')
  assert.equal(plan.posts[1].status, 'published')
  assert.equal(plan.posts[1].member, 'ICES0005')
  assert.equal(plan.posts[2].expiresAt, null)
  assert.deepEqual(plan.posts[0].imageUrls, ['https://example.org/a.jpg', 'https://example.org/a.jpg'])
  assert.equal(plan.posts[3].category, null)
  assert.equal(plan.posts[3].title, null)
  assert.ok(result.warnings.some((warning) => warning.includes('daily/quarterly')))

  const tokenRequests = fixture.requests.filter(({ url }) => url.pathname.endsWith('/token'))
  assert.equal(tokenRequests.length, 1)
  assert.deepEqual(Object.fromEntries(new URLSearchParams(tokenRequests[0].body)), {
    grant_type: 'password', client_id: 'komunitin-app', username: 'admin@example.org', password: 'secret',
    scope: 'komunitin_social komunitin_social_read_all',
  })
  const requests = fixture.requests.filter(({ url }) => !url.pathname.endsWith('/token'))
  assert.ok(requests.every(({ authorization }) => authorization === 'Bearer fixture-token'))
  assert.ok(requests.every(({ url }) => url.pathname.startsWith('/drupal/ces/api/social/')))
  assert.equal(requests.filter(({ url }) => url.pathname.endsWith('/categories')).length, 1)
  assert.equal(requests.filter(({ url }) => url.pathname.endsWith('/users')).length, 6)
  const memberRequests = requests.filter(({ url }) => url.pathname.endsWith('/members'))
  assert.deepEqual(memberRequests.map(({ url }) => url.searchParams.get('page[after]')), ['0', '2', '4', '6'])
  assert.ok(memberRequests.every(({ url }) => url.searchParams.get('filter[state]') === 'draft,pending,active,disabled,suspended,deleted'))
  const offerRequests = requests.filter(({ url }) => url.pathname.endsWith('/offers'))
  assert.deepEqual(offerRequests.map(({ url }) => url.searchParams.get('page[after]')), ['0', '0'])
  assert.deepEqual(offerRequests.map(({ url }) => url.searchParams.get('page[size]')), ['2', '4'])
  assert.ok(requests.filter(({ url }) => /\/(offers|needs)$/.test(url.pathname)).every(({ url }) =>
    url.searchParams.get('filter[state]') === 'published,hidden' && url.searchParams.get('filter[expired]') === 'true,false'))
})

test('fails on incomplete or malformed source responses', async (t) => {
  const cases = [
    { name: 'authorization failure', path: 'users', status: 403, body: {}, message: /HTTP 403/ },
    { name: 'filtered-out owner', path: 'users', body: { data: [] }, message: /owner/ },
    { name: 'invalid document', path: 'ICES', body: { data: null }, message: /invalid JSON:API/ },
    { name: 'missing includes', path: 'ICES', body: { data: { type: 'groups', id: icesId(1), attributes: { code: 'ICES' } } }, message: /settings/ },
  ]
  for (const scenario of cases) {
    await t.test(scenario.name, async (t) => {
      const fixture = await serveIces(t)
      fixture.overrides.set(`/drupal/ces/api/social/${scenario.path}`, () => scenario)
      await assert.rejects(createIcesMigrationBundle({ url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' } }), scenario.message)
    })
  }
  await t.test('repeated pagination', async (t) => {
    const fixture = await serveIces(t)
    fixture.overrides.set('/drupal/ces/api/social/ICES/members', () => ({ body: {
      data: [fixture.members[0]], included: [fixture.contacts[0], fixture.socialContact], links: { next: 'https://public.example/?page[after]=1' },
    } }))
    await assert.rejects(createIcesMigrationBundle({ url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' }, pageSize: 1 }), /repeated/)
  })
  await t.test('source reference missing', async (t) => {
    const fixture = await serveIces(t)
    fixture.posts[0].relationships.member.data.id = icesId(999)
    await assert.rejects(createIcesMigrationBundle({ url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' } }), /outside the exported community/)
  })
})

test('exports source values for separate import validation', async (t) => {
  const fixture = await serveIces(t)
  fixture.members[0].attributes.name = ''
  const exported = await createIcesMigrationBundle({ url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' } })
  const parsed = await parseMigrationBundle({ type: 'zip', bytes: exported.bytes })
  assert.ok(!parsed.success)
  assert.ok(parsed.errors.some((issue) => issue.file === 'members.csv' && issue.column === 'name'))
})

test('IntegralCES social bundles validate supplied accounting data, UUIDs and references', async (t) => {
  const fixture = await serveIces(t)
  const exported = await createIcesMigrationBundle({ url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' } })
  const { files } = await loadMigrationBundle({ type: 'zip', bytes: exported.bytes }, MIGRATION_PARSER_LIMITS)
  const cases = [
    ['community.csv', 'status', 'unknown', 'INVALID_ENUM'],
    ['community.csv', 'currency.id', 'wrong', 'INVALID_UUID'],
    ['members.csv', 'account.id', 'wrong', 'INVALID_UUID'],
    ['community.csv', 'adminUsers', '', 'REQUIRED_FIELD'],
    ['users.csv', 'id', 'wrong', 'INVALID_UUID'],
    ['users.csv', 'id', icesId(201), 'DUPLICATE_VALUE'],
    ['members.csv', 'account.id', icesId(900), 'ACCOUNT_FIELD_NOT_ALLOWED'],
    ['member-users.csv', 'user', 'missing@example.org', 'MISSING_REFERENCE'],
  ] as const
  for (const [file, column, value, expected] of cases) {
    const invalid = mutateCsv(files, file, 1, column, value)
    const parsed = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(invalid) })
    assert.ok(resultCodes(parsed).includes(expected), JSON.stringify(parsed))
  }
  const transfers = [[...CSV_HEADERS['transfers.csv']]]
  transfers.push(['', 'ICES0002', 'ICES0003', 'user2@example.org', '1', '', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'])
  const withTransfers = new Map(files).set('transfers.csv', encodeCsv(transfers))
  assert.ok(resultCodes(await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(withTransfers) })).includes('MISSING_CURRENCY_SCALE'))
  const members = parse(files.get('members.csv')!.toString()) as string[][]
  members[0].push('account.balance')
  members.slice(1).forEach((row) => row.push('0'))
  const withBalances = new Map(files).set('members.csv', encodeCsv(members))
  assert.ok(resultCodes(await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(withBalances) })).includes('MISSING_CURRENCY_SCALE'))
})


test('accepts omitted or header-only transfers in ZIP and directory IntegralCES social bundles', async (t) => {
  const fixture = await serveIces(t)
  const exported = await createIcesMigrationBundle({ url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' } })
  const { files } = await loadMigrationBundle({ type: 'zip', bytes: exported.bytes }, MIGRATION_PARSER_LIMITS)
  assert.equal(files.has('transfers.csv'), false)
  const expected = await parseMigrationBundle({ type: 'zip', bytes: exported.bytes })
  assert.ok(expected.success)
  assert.deepEqual(await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(omitBlankColumns(files)) }), expected)
  const directory = await mkdtemp(join(tmpdir(), 'ices-bundle-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const [file, bytes] of files) await writeFile(join(directory, file), bytes)
  assert.deepEqual(await parseMigrationBundle({ type: 'directory', path: directory }), expected)

  const emptyTransfers = encodeCsv([CSV_HEADERS['transfers.csv']])
  files.set('transfers.csv', emptyTransfers)
  await writeFile(join(directory, 'transfers.csv'), emptyTransfers)
  assert.deepEqual(await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) }), expected)
  assert.deepEqual(await parseMigrationBundle({ type: 'directory', path: directory }), expected)
})


test('exports social data when the source exposes no currency or account UUIDs', async (t) => {
  const fixture = await serveIces(t)
  fixture.group.relationships.currency.data = null
  for (const member of fixture.members) member.relationships.account.data = null
  const exported = await createIcesMigrationBundle({ url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'secret' } })
  const parsed = await parseMigrationBundle({ type: 'zip', bytes: exported.bytes })
  assert.ok(parsed.success, JSON.stringify(parsed))
  assert.equal(parsed.plan.community.code, 'ICES')
  assert.equal(parsed.plan.community.currencyId, null)
  assert.ok(parsed.plan.members.every(({ accountId }) => accountId === null))
})


test('exports every community state across group pages with one admin login', async (t) => {
  const fixture = await serveIces(t)
  for (const [index, status] of ['pending', 'active'].entries()) {
    fixture.groups.push({ ...fixture.group, id: icesId(900 + index),
      attributes: { ...fixture.group.attributes, code: `NET${index}`, status } })
  }
  const codes = []
  for await (const result of createAllIcesMigrationBundles({
    url: fixture.url, auth: { email: 'admin@example.org', password: 'secret' }, pageSize: 2,
  })) {
    const parsed = await parseMigrationBundle({ type: 'zip', bytes: result.bytes })
    assert.ok(parsed.success, JSON.stringify(parsed))
    assert.equal(parsed.plan.community.code, result.code)
    codes.push(result.code)
  }
  assert.deepEqual(codes, ['ICES', 'NET0', 'NET1'])
  const pages = fixture.requests.filter(({ url }) => url.pathname.endsWith('/groups'))
  assert.deepEqual(pages.map(({ url }) => url.searchParams.get('page[after]')), ['0', '2'])
  assert.ok(pages.every(({ url }) => url.searchParams.get('filter[status]') === 'pending,active,disabled'))
  assert.equal(fixture.requests.filter(({ url }) => url.pathname.endsWith('/token')).length, 1)
})

test('rejects invalid admin authentication before reading source data', async (t) => {
  for (const scenario of [
    { status: 401, body: { error: 'invalid_grant' }, message: /HTTP 401/ },
    { body: { access_token: '', expires_in: 3600 }, message: /invalid OAuth token/ },
  ]) {
    const fixture = await serveIces(t)
    fixture.overrides.set('/drupal/oauth2/token', () => scenario)
    await assert.rejects(createIcesMigrationBundle({
      url: fixture.url, code: 'ICES', auth: { email: 'admin@example.org', password: 'wrong' },
    }), scenario.message)
    assert.equal(fixture.requests.length, 1)
  }
})
