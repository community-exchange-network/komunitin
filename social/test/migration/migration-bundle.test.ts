import assert from 'node:assert/strict'
import test from 'node:test'
import { parse } from 'csv-parse/sync'
import { parseExactAmount } from '../../src/features/migrations/bundle/amounts'
import { parseMigrationBundle } from '../../src/features/migrations/bundle/index'
import {
  exampleDirectory,
  encodeCsv,
  loadExampleFiles,
  mutateCsv,
  resultCodes,
  zipFromFiles,
} from './migration-bundle-helpers'

test('parses the canonical example directory into a normalized JSON-safe plan', async () => {
  const result = await parseMigrationBundle({ type: 'directory', path: exampleDirectory })
  assert.equal(result.success, true)
  if (!result.success) return

  assert.equal(result.plan.community.status, 'active')
  assert.doesNotThrow(() => JSON.stringify(result.plan))
  assert.deepStrictEqual(result.summary, {
    users: 2,
    memberUsers: 2,
    members: 2,
    accounts: 2,
    transfers: 1,
    categories: 1,
    offers: 1,
    needs: 1,
    images: 2,
  })
  assert.deepStrictEqual(result.plan.members.map((member) => member.account?.balance), ['-500', '500'])
  assert.deepStrictEqual(result.plan.transfers[0], {
    id: '123e4567-e89b-42d3-a456-426614174000',
    payer: 'EXMP0001',
    payee: 'EXMP0002',
    user: 'alice@example.org',
    amount: '500',
    description: 'Example payment',
    createdAt: '2025-02-01T12:00:00.000Z',
    updatedAt: '2025-02-01T12:00:00.000Z',
  })
  assert.equal(result.plan.users[0].language, 'en')
  assert.equal(result.plan.users[0].status, 'active')
  assert.ok(result.plan.members.every((member) => member.deleted === null))
  assert.deepStrictEqual(result.plan.memberUsers[0], {
    id: null,
    member: 'EXMP0001',
    user: 'alice@example.org',
    notifications: { myAccount: true, group: true },
    emails: { myAccount: true, group: 'weekly' },
  })
  assert.deepStrictEqual(result.plan.members.map((member) => member.account?.users), [
    ['alice@example.org'], ['bob@example.org'],
  ])
  assert.equal(result.plan.community.currency!.rateNumerator, 1)
  assert.equal(result.plan.community.currency!.rateDenominator, 1)
  assert.equal(result.plan.community.settings.minNeeds, 0)
  assert.equal(result.plan.community.address?.locality, 'Barcelona')
  assert.deepStrictEqual(result.plan.community.location, { type: 'Point', longitude: 2.1734, latitude: 41.3851 })
  assert.equal(result.plan.categories[0].description, 'Things neighbours can share or do together.')
  assert.deepStrictEqual(result.plan.posts.map(({ type }) => type), ['offer', 'need'])
  assert.deepStrictEqual(result.plan.images, [
    {
      sourceUrl: 'https://example.org/community.jpg',
      ownerType: 'community',
      ownerKey: 'EXMP',
      position: 0,
    },
    {
      sourceUrl: 'https://example.org/bread.jpg',
      ownerType: 'offer',
      ownerKey: 'fresh-bread',
      position: 0,
    },
  ])
})

test('parses generated ZIP entries identically regardless of entry order', async () => {
  const files = await loadExampleFiles()
  const forward = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  const reverse = await parseMigrationBundle({
    type: 'zip',
    bytes: await zipFromFiles(files, [...files.keys()].reverse()),
  })
  assert.equal(forward.success, true)
  assert.deepStrictEqual(reverse, forward)
})

test('normalizes email, timestamps, quoted commas, and quoted newlines', async () => {
  let files = await loadExampleFiles()
  files = mutateCsv(files, 'users.csv', 1, 'email', ' Alice@Example.ORG ')
  files = mutateCsv(files, 'member-users.csv', 1, 'user', ' ALICE@EXAMPLE.ORG ')
  files = mutateCsv(files, 'users.csv', 1, 'createdAt', '2025-01-01T10:00:00+01:00')
  files = mutateCsv(files, 'users.csv', 1, 'name', 'Alice, Example\nOperator')
  files = mutateCsv(files, 'community.csv', 1, 'adminUsers', 'alice@example.org;BOB@EXAMPLE.ORG')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.plan.users[0].email, 'alice@example.org')
  assert.equal(result.plan.memberUsers[0].user, 'alice@example.org')
  assert.equal(result.plan.users[0].name, 'Alice, Example\nOperator')
  assert.equal(result.plan.users[0].createdAt, '2025-01-01T09:00:00.000Z')
  assert.deepStrictEqual(result.plan.community.adminUsers, ['alice@example.org', 'bob@example.org'])
})

test('accepts documented columns in any order', async () => {
  const files = await loadExampleFiles()
  const records = parse(files.get('users.csv')!.toString('utf8')) as string[][]
  files.set('users.csv', encodeCsv(records.map((record) => [...record].reverse())))
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
})

test('validates each CSV header exactly', async (t) => {
  const example = await loadExampleFiles()
  for (const filename of example.keys()) {
    await t.test(filename, async () => {
      const files = new Map(example)
      const data = Buffer.from(files.get(filename)!)
      data[0] = data[0] === 0x78 ? 0x79 : 0x78
      files.set(filename, data)
      const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
      assert.ok(resultCodes(result).includes('INVALID_HEADER'))
    })
  }
})

test('reports representative structural field errors with record and column', async (t) => {
  const cases = [
    ['community.csv', 'access', 'Public', 'INVALID_ENUM'],
    ['member-users.csv', 'notifications.group', 'TRUE', 'INVALID_BOOLEAN'],
    ['users.csv', 'passwordHash', 'plaintext-password', 'INVALID_PASSWORD_HASH'],
    ['users.csv', 'language', 'x'.repeat(32), 'MAX_LENGTH'],
    ['users.csv', 'status', 'pending', 'INVALID_ENUM'],
    ['members.csv', 'status', 'ACTIVE', 'INVALID_ENUM'],
    ['members.csv', 'code', 'EXMP' + 'x'.repeat(252), 'MAX_LENGTH'],
    ['members.csv', 'account.settings.acceptPaymentsAfter', 'false', 'INVALID_INTEGER'],
    ['members.csv', 'account.settings.acceptPaymentsAfter', '-1', 'INVALID_INTEGER'],
    ['members.csv', 'account.settings.onPaymentCreditLimit', 'false', 'INVALID_AMOUNT'],
    ['members.csv', 'account.settings.onPaymentCreditLimit', '-1', 'INVALID_AMOUNT'],
    ['transfers.csv', 'amount', '5e2', 'INVALID_AMOUNT'],
    ['categories.csv', 'icon.value', '', 'INVALID_FIELD_GROUP'],
    ['posts.csv', 'title', '', 'REQUIRED_FIELD'],
    ['community.csv', 'location.longitude', '181', 'INVALID_COORDINATE'],
    ['posts.csv', 'imageUrls', 'file:///tmp/image.jpg', 'INVALID_URL'],
    ['transfers.csv', 'id', 'not-a-uuid', 'INVALID_UUID'],
  ] as const
  const example = await loadExampleFiles()

  for (const [filename, column, value, code] of cases) {
    await t.test(`${filename} ${column}`, async () => {
      const files = mutateCsv(example, filename, 1, column, value)
      const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
      assert.equal(result.success, false)
      if (result.success) return
      assert.ok(result.errors.some((error) =>
        error.code === code && error.file === filename && error.row === 2 && error.column === column,
      ))
    })
  }
})

test('rejects invalid UTF-8 and accepts a UTF-8 BOM', async () => {
  const example = await loadExampleFiles()
  const invalid = new Map(example)
  invalid.set('users.csv', Buffer.from([0xff]))
  const invalidResult = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(invalid) })
  assert.ok(resultCodes(invalidResult).includes('INVALID_UTF8'))

  const bom = new Map(example)
  bom.set('users.csv', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bom.get('users.csv')!]))
  const bomResult = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(bom) })
  assert.equal(bomResult.success, true, JSON.stringify(bomResult))
})

test('parses scaled amounts exactly at signed 64-bit boundaries', () => {
  assert.deepStrictEqual(parseExactAmount('0.001', 3), { success: true, value: 1n })
  assert.deepStrictEqual(parseExactAmount('9223372036854775807', 0), {
    success: true,
    value: 9223372036854775807n,
  })
  assert.deepStrictEqual(parseExactAmount('-9223372036854775808', 0), {
    success: true,
    value: -9223372036854775808n,
  })
  assert.equal(parseExactAmount('9223372036854775808', 0).success, false)
  assert.equal(parseExactAmount('1.001', 2).success, false)
  assert.equal(parseExactAmount('+1', 2).success, false)
})

test('enforces missing-file, byte, row, and error-reporting limits', async () => {
  const example = await loadExampleFiles()
  const missing = new Map(example)
  missing.delete('users.csv')
  assert.ok(resultCodes(await parseMigrationBundle({
    type: 'zip', bytes: await zipFromFiles(missing),
  })).includes('MISSING_FILE'))

  const zip = await zipFromFiles(example)
  assert.ok(resultCodes(await parseMigrationBundle(
    { type: 'zip', bytes: zip }, { maxCompressedBytes: zip.length - 1 },
  )).includes('ZIP_TOO_LARGE'))
  assert.ok(resultCodes(await parseMigrationBundle(
    { type: 'zip', bytes: zip }, { maxExpandedBytes: 1 },
  )).includes('EXPANDED_DATA_TOO_LARGE'))
  assert.ok(resultCodes(await parseMigrationBundle(
    { type: 'zip', bytes: zip }, { maxRows: 0 },
  )).includes('ROW_LIMIT_EXCEEDED'))

  let manyErrors = mutateCsv(example, 'users.csv', 1, 'email', 'invalid')
  manyErrors = mutateCsv(manyErrors, 'users.csv', 1, 'createdAt', 'invalid')
  const truncated = await parseMigrationBundle(
    { type: 'zip', bytes: await zipFromFiles(manyErrors) }, { maxErrors: 1 },
  )
  assert.deepStrictEqual(resultCodes(truncated), ['INVALID_EMAIL', 'ERROR_LIMIT_EXCEEDED'])
})

test('preserves compatible password hashes and rejects unsupported credentials without echoing them', async (t) => {
  const example = await loadExampleFiles()
  const records = parse(example.get('users.csv')!.toString('utf8')) as string[][]
  const hash = records[1][records[0].indexOf('passwordHash')]
  const cases = [
    ['Auth bcrypt', hash, true],
    ['older bcrypt', hash.replace('$2b$', '$2a$'), true],
    ['no password', '', true],
    ['plaintext', 'do-not-echo-this-password', false],
    ['Drupal', '$S$' + 'a'.repeat(52), false],
    ['truncated bcrypt', hash.slice(0, -1), false],
    ['unsupported bcrypt version', hash.replace('$2b$', '$2y$'), false],
    ['invalid cost', hash.replace('$10$', '$03$'), false],
  ] as const
  for (const [name, value, valid] of cases) {
    await t.test(name, async () => {
      const files = mutateCsv(example, 'users.csv', 1, 'passwordHash', value)
      const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
      assert.equal(result.success, valid, JSON.stringify(result))
      if (result.success) {
        assert.equal(result.plan.users[0].passwordHash, value || null)
        assert.equal(result.plan.users[1].passwordHash, null)
      } else {
        assert.deepStrictEqual(result.errors.map(({ code, file, row, column }) => ({ code, file, row, column })), [
          { code: 'INVALID_PASSWORD_HASH', file: 'users.csv', row: 2, column: 'passwordHash' },
        ])
        assert.ok(!JSON.stringify(result.errors).includes(value))
      }
    })
  }
})


test('omitting transfers still enforces complete history for created accounts', async () => {
  const files = await loadExampleFiles()
  files.delete('transfers.csv')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.ok(!result.success)
  assert.ok(result.errors.some(({ code }) => code === 'BALANCE_MISMATCH'))
})

test('bundles retain the same contact types for communities and members', async () => {
  const contacts = [
    { type: 'phone', value: '+34123456789' },
    { type: 'email', value: 'contact@example.org' },
    { type: 'telegram', value: '@telegram' },
    { type: 'whatsapp', value: '+34987654321' },
    { type: 'website', value: 'https://example.org/' },
    { type: 'instagram', value: '@instagram' },
    { type: 'facebook', value: 'https://facebook.com/example' },
    { type: 'twitter', value: '@twitter' },
  ]
  let files = await loadExampleFiles()
  for (const file of ['community.csv', 'members.csv'] as const) {
    for (const { type, value } of contacts) files = mutateCsv(files, file, 1, `contact.${type}`, value)
  }
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.ok(result.success, JSON.stringify(result))
  assert.deepEqual(result.plan.community.contacts, contacts)
  assert.deepEqual(result.plan.members[0].contacts, contacts)
})
