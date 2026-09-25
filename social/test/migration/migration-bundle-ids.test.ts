import assert from 'node:assert/strict'
import test from 'node:test'
import { parse } from 'csv-parse/sync'
import { parseMigrationBundle } from '../../src/features/migrations/bundle'
import { appendCsvRow, encodeCsv, loadExampleFiles, mutateCsv, omitBlankColumns, zipFromFiles } from './migration-bundle-helpers'

const uuid = 'abcdef01-2345-4678-9abc-0123456789ab'
const idColumns = [
  ['community.csv', 'id'],
  ['community.csv', 'currency.id'],
  ['users.csv', 'id'],
  ['member-users.csv', 'id'],
  ['members.csv', 'id'],
  ['members.csv', 'account.id'],
  ['transfers.csv', 'id'],
  ['categories.csv', 'id'],
  ['posts.csv', 'id'],
] as const

const parseFiles = async (files: Awaited<ReturnType<typeof loadExampleFiles>>) =>
  parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })

test('preserves optional UUIDs for every resource, independently of relationship keys', async () => {
  let files = await loadExampleFiles()
  for (const [file, column] of idColumns) files = mutateCsv(files, file, 1, column, uuid.toUpperCase())
  const result = await parseFiles(files)
  assert.ok(result.success, JSON.stringify(result))
  const { plan } = result
  assert.deepEqual([
    plan.community.id, plan.community.currencyId, plan.users[0].id, plan.memberUsers[0].id,
    plan.members[0].id, plan.members[0].accountId, plan.transfers[0].id, plan.categories[0].id, plan.posts[0].id,
  ], idColumns.map(() => uuid))
  assert.equal(plan.memberUsers[0].member, 'EXMP0001')
  assert.equal(plan.memberUsers[0].user, 'alice@example.org')
  assert.equal(plan.members[0].account?.code, 'EXMP0001')
})

test('rejects malformed UUIDs with the exact column', async (t) => {
  const example = await loadExampleFiles()
  for (const [file, column] of idColumns) {
    await t.test(`${file} ${column}`, async () => {
      const result = await parseFiles(mutateCsv(example, file, 1, column, 'not-a-uuid'))
      assert.ok(!result.success)
      assert.ok(result.errors.some((error) => error.code === 'INVALID_UUID'
        && error.file === file && error.column === column && error.row === 2))
    })
  }
})

test('rejects duplicate supplied UUIDs case-insensitively within each resource table', async (t) => {
  const example = await loadExampleFiles()
  for (const [file, column] of idColumns.filter(([file]) => file !== 'community.csv')) {
    await t.test(`${file} ${column}`, async () => {
      let files = mutateCsv(example, file, 1, column, uuid)
      files = appendCsvRow(files, file, 1, { [column]: uuid.toUpperCase() })
      const result = await parseFiles(files)
      assert.ok(!result.success)
      assert.ok(result.errors.some((error) => error.code === 'DUPLICATE_VALUE'
        && error.file === file && error.column === column))
    })
  }
})

test('accepts repeated blank UUIDs and treats omitted blank columns identically', async () => {
  let files = await loadExampleFiles()
  files = mutateCsv(files, 'transfers.csv', 1, 'id', '')
  files = mutateCsv(files, 'transfers.csv', 1, 'amount', '2.50')
  files = appendCsvRow(files, 'transfers.csv', 1, {})
  const result = await parseFiles(files)
  assert.ok(result.success, JSON.stringify(result))
  assert.deepEqual(result.plan.transfers.map(({ id }) => id), [null, null])
  assert.equal(result.plan.community.id, null)
  assert.equal(result.plan.community.currencyId, null)
  for (const records of [result.plan.users, result.plan.memberUsers, result.plan.members,
    result.plan.categories, result.plan.posts]) assert.ok(records.every(({ id }) => id === null))
  assert.ok(result.plan.members.every(({ accountId }) => accountId === null))
  assert.deepEqual(await parseFiles(omitBlankColumns(files)), result)
})

test('omitted required columns still fail value validation and duplicate headers remain invalid', async () => {
  const example = await loadExampleFiles()
  const records = parse(example.get('users.csv')!.toString()) as string[][]
  const emailIndex = records[0].indexOf('email')
  const missing = records.map((row) => row.filter((_, index) => index !== emailIndex))
  const result = await parseFiles(new Map(example).set('users.csv', encodeCsv(missing)))
  assert.ok(!result.success)
  assert.ok(result.errors.some(({ file, column, row }) => file === 'users.csv' && column === 'email' && row === 2))
  const duplicate = records.map((row) => [...row, row[emailIndex]])
  const invalid = await parseFiles(new Map(example).set('users.csv', encodeCsv(duplicate)))
  assert.ok(!invalid.success)
  assert.ok(invalid.errors.some(({ code, column }) => code === 'INVALID_HEADER' && column === 'email'))
})
