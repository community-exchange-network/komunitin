import assert from 'node:assert/strict'
import test from 'node:test'
import { parse } from 'csv-parse/sync'
import { parseMigrationBundle } from '../../src/features/migrations/bundle'
import { encodeCsv, loadExampleFiles, mutateCsv, omitBlankColumns, zipFromFiles } from './migration-bundle-helpers'

type Files = Awaited<ReturnType<typeof loadExampleFiles>>
const currencyId = '123e4567-e89b-42d3-a456-426614174000'
const accountId = (row: number) => `abcdef01-2345-4678-9abc-${String(row).padStart(12, '0')}`
const parseFiles = async (files: Files) => parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })

const referenceRecords = (files: Files, file: 'community.csv' | 'members.csv') => {
  const prefix = file === 'community.csv' ? 'currency.' : 'account.'
  const records = parse(files.get(file)!.toString()) as string[][]
  const rows = records.map((row, index) => index === 0 ? row : row.map((value, column) => {
    const header = records[0][column]
    return header === `${prefix}id` ? (file === 'community.csv' ? currencyId : accountId(index))
      : header.startsWith(prefix) ? '' : value
  }))
  return new Map(files).set(file, encodeCsv(rows))
}

test('preserves every community status with the same bundle format', async (t) => {
  const example = await loadExampleFiles()
  for (const status of ['pending', 'active', 'disabled']) {
    await t.test(status, async () => {
      const result = await parseFiles(mutateCsv(example, 'community.csv', 1, 'status', status))
      assert.ok(result.success, JSON.stringify(result))
      assert.equal(result.plan.community.status, status)
    })
  }
  const result = await parseFiles(mutateCsv(example, 'community.csv', 1, 'status', ''))
  assert.ok(!result.success)
  assert.ok(result.errors.some(({ file, column, code }) =>
    file === 'community.csv' && column === 'status' && code === 'INVALID_ENUM'))
})

test('preserves optional accounting IDs with omitted or blank fields', async () => {
  const files = referenceRecords(referenceRecords(await loadExampleFiles(), 'community.csv'), 'members.csv')
  files.delete('transfers.csv')
  const result = await parseFiles(files)
  assert.ok(result.success, JSON.stringify(result))
  assert.equal(result.plan.community.currency, null)
  assert.equal(result.plan.community.currencyId, currencyId)
  assert.equal(result.plan.community.id, null)
  assert.ok(result.plan.members.every(({ account }) => account === null))
  assert.deepEqual(result.plan.members.map(({ accountId }) => accountId), [accountId(1), accountId(2)])
  assert.equal(result.summary.accounts, 0)
  assert.equal(result.summary.transfers, 0)
  assert.deepEqual(await parseFiles(omitBlankColumns(files)), result)
})

test('resolves currencies and accounts by code without IDs or other accounting fields', async () => {
  let files = referenceRecords(referenceRecords(await loadExampleFiles(), 'community.csv'), 'members.csv')
  files.delete('transfers.csv')
  files = mutateCsv(files, 'community.csv', 1, 'currency.id', '')
  for (const row of [1, 2]) files = mutateCsv(files, 'members.csv', row, 'account.id', '')
  const result = await parseFiles(omitBlankColumns(files))
  assert.ok(result.success, JSON.stringify(result))
  assert.equal(result.plan.community.code, 'EXMP')
  assert.equal(result.plan.community.currencyId, null)
  assert.equal(result.plan.community.currency, null)
  assert.deepEqual(result.plan.members.map(({ code, accountId, account }) => ({ code, accountId, account })), [
    { code: 'EXMP0001', accountId: null, account: null },
    { code: 'EXMP0002', accountId: null, account: null },
  ])
})

test('retains partial accounting fields for reconciliation without requiring complete creation data', async () => {
  let files = referenceRecords(referenceRecords(await loadExampleFiles(), 'community.csv'), 'members.csv')
  files.delete('transfers.csv')
  files = mutateCsv(files, 'community.csv', 1, 'currency.id', '')
  files = mutateCsv(files, 'community.csv', 1, 'currency.name', 'Existing currency')
  files = mutateCsv(files, 'community.csv', 1, 'currency.scale', '2')
  files = mutateCsv(files, 'community.csv', 1, 'currency.settings.defaultAllowPayments', 'false')
  files = mutateCsv(files, 'members.csv', 1, 'account.id', '')
  files = mutateCsv(files, 'members.csv', 1, 'account.creditLimit', '10.50')
  files = mutateCsv(files, 'members.csv', 1, 'account.settings.allowPayments', 'false')
  const result = await parseFiles(files)
  assert.ok(result.success, JSON.stringify(result))
  assert.equal(result.plan.community.currency?.name, 'Existing currency')
  assert.equal(result.plan.community.currency?.namePlural, null)
  assert.equal(result.plan.community.currency?.settings.defaultAllowPayments, false)
  assert.equal(result.plan.members[0].account?.creditLimit, '1050')
  assert.equal(result.plan.members[0].account?.balance, null)
  assert.equal(result.plan.members[0].account?.settings.allowPayments, false)
  assert.deepEqual(await parseFiles(omitBlankColumns(files)), result)
})

test('validates supplied monetary values without inventing a missing currency scale', async () => {
  const files = referenceRecords(await loadExampleFiles(), 'community.csv')
  const invalid = await parseFiles(files)
  assert.ok(!invalid.success)
  assert.ok(invalid.errors.some(({ code }) => code === 'MISSING_CURRENCY_SCALE'))
  const result = await parseFiles(mutateCsv(files, 'community.csv', 1, 'currency.scale', '2'))
  assert.ok(result.success, JSON.stringify(result))
  assert.equal(result.plan.community.currency?.name, null)
  assert.equal(result.plan.transfers[0].amount, '500')
})

test('code-only accounts resolve whitelist and transfer references', async () => {
  let files = referenceRecords(await loadExampleFiles(), 'members.csv')
  for (const row of [1, 2]) files = mutateCsv(files, 'members.csv', row, 'account.id', '')
  files = mutateCsv(files, 'community.csv', 1, 'currency.settings.defaultAcceptPaymentsWhitelist', 'EXMP0001')
  const result = await parseFiles(files)
  assert.ok(result.success, JSON.stringify(result))
  assert.equal(result.plan.community.currency?.settings.defaultAcceptPaymentsWhitelist[0], 'EXMP0001')
  assert.equal(result.plan.transfers[0].payer, 'EXMP0001')
  assert.equal(result.plan.members[0].account, null)
})

test('unknown user metadata and preserved social states use common migration rules', async () => {
  let files = await loadExampleFiles()
  for (const column of ['status', 'createdAt', 'updatedAt']) files = mutateCsv(files, 'users.csv', 1, column, '')
  files = mutateCsv(files, 'member-users.csv', 2, 'user', 'alice@example.org')
  files = mutateCsv(files, 'members.csv', 1, 'status', 'disabled')
  files = mutateCsv(files, 'community.csv', 1, 'settings.defaultGroupEmailFrequency', 'daily')
  files = mutateCsv(files, 'member-users.csv', 1, 'emails.group', 'quarterly')
  const result = await parseFiles(files)
  assert.ok(result.success, JSON.stringify(result))
  assert.equal(result.plan.users[0].status, null)
  assert.equal(result.plan.users[0].createdAt, null)
  assert.equal(result.plan.users[0].updatedAt, null)
  assert.equal(result.plan.posts[0].status, 'published')
  assert.equal(result.plan.community.settings.defaultGroupEmailFrequency, 'daily')
  assert.equal(result.plan.memberUsers[0].emails.group, 'quarterly')
})
