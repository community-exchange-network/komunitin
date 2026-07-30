import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

  assert.doesNotThrow(() => JSON.stringify(result.plan))
  assert.equal(
    createHash('sha256').update(JSON.stringify(result.plan)).digest('hex'),
    '0ee9b4548ccfdfe816511ea7ca680734981af04574c305a7d5f47d81033bef81',
    'normalized example plan snapshot changed',
  )
  assert.deepStrictEqual(result.summary, {
    users: 2,
    members: 2,
    accounts: 2,
    transfers: 1,
    categories: 1,
    offers: 1,
    wants: 1,
    images: 2,
  })
  assert.deepStrictEqual(result.plan.members.map((member) => member.account?.balance), ['-500', '500'])
  assert.equal(result.plan.transfers[0].amount, '500')
  assert.deepStrictEqual(result.plan.images, [
    {
      sourceKey: 'community:EXMP:image:0',
      sourceUrl: 'https://example.org/community.jpg',
      ownerType: 'community',
      ownerKey: 'EXMP',
      position: 0,
    },
    {
      sourceKey: 'offer:fresh-bread:image:0',
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
  files = mutateCsv(files, 'users.csv', 1, 'createdAt', '2025-01-01T10:00:00+01:00')
  files = mutateCsv(files, 'users.csv', 1, 'name', 'Alice, Example\nOperator')
  files = mutateCsv(files, 'community.csv', 1, 'adminUsers', 'alice@example.org;BOB@EXAMPLE.ORG')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.plan.users[0].email, 'alice@example.org')
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
    ['users.csv', 'settings.notifications.group', 'TRUE', 'INVALID_BOOLEAN'],
    ['members.csv', 'status', 'ACTIVE', 'INVALID_ENUM'],
    ['transfers.csv', 'amount', '5e2', 'INVALID_AMOUNT'],
    ['categories.csv', 'icon.value', '', 'INVALID_FIELD_GROUP'],
    ['posts.csv', 'title', '', 'REQUIRED_FIELD'],
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
  assert.deepStrictEqual(resultCodes(truncated), ['INVALID_TIMESTAMP', 'ERROR_LIMIT_EXCEEDED'])
})
