import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMigrationBundle } from '../../src/features/migrations/bundle/index'
import {
  loadExampleFiles,
  mutateCsv,
  resultCodes,
  zipFromFiles,
} from './migration-bundle-helpers'

test('reports representative semantic relationship and uniqueness failures', async (t) => {
  const example = await loadExampleFiles()
  const cases = [
    ['duplicate normalized email', (files: typeof example) =>
      mutateCsv(files, 'users.csv', 2, 'email', 'ALICE@EXAMPLE.ORG'), 'DUPLICATE_VALUE'],
    ['unknown member owner', (files: typeof example) =>
      mutateCsv(files, 'members.csv', 1, 'adminUsers', 'missing@example.org'), 'MISSING_REFERENCE'],
    ['community admin without membership', (files: typeof example) => {
      let changed = mutateCsv(files, 'community.csv', 1, 'adminUsers', 'alice@example.org;bob@example.org')
      changed = mutateCsv(changed, 'members.csv', 2, 'adminUsers', 'alice@example.org')
      return changed
    }, 'ADMIN_NOT_MEMBER'],
    ['currency admin outside group admins', (files: typeof example) =>
      mutateCsv(files, 'community.csv', 1, 'adminUsers', 'bob@example.org'), 'INVALID_CURRENCY_ADMIN'],
    ['unknown transfer account', (files: typeof example) =>
      mutateCsv(files, 'transfers.csv', 1, 'payeeAccountCode', 'EXMP9999'), 'MISSING_ACCOUNT_REFERENCE'],
    ['self transfer', (files: typeof example) =>
      mutateCsv(files, 'transfers.csv', 1, 'payeeAccountCode', 'EXMP0001'), 'SELF_TRANSFER'],
    ['unknown category', (files: typeof example) =>
      mutateCsv(files, 'posts.csv', 1, 'categoryCode', 'missing'), 'MISSING_REFERENCE'],
    ['inactive published owner', (files: typeof example) =>
      mutateCsv(files, 'members.csv', 1, 'status', 'disabled'), 'INACTIVE_POST_OWNER'],
    ['invalid payment whitelist', (files: typeof example) =>
      mutateCsv(
        files,
        'community.csv',
        1,
        'currency.settings.defaultAcceptPaymentsWhitelist',
        'EXMP9999',
      ), 'MISSING_ACCOUNT_REFERENCE'],
  ] as const

  for (const [name, mutate, expectedCode] of cases) {
    await t.test(name, async () => {
      const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(mutate(example)) })
      assert.ok(resultCodes(result).includes(expectedCode), JSON.stringify(result))
    })
  }
})

test('accepts opaque keys without re-authorizing historical transfers', async () => {
  let files = await loadExampleFiles()
  files = mutateCsv(files, 'transfers.csv', 1, 'sourceKey', '123e4567-e89b-12d3-a456-426614174000')
  files = mutateCsv(files, 'transfers.csv', 1, 'initiatorUser', 'bob@example.org')
  files = mutateCsv(files, 'community.csv', 1, 'adminUsers', 'alice@example.org')
  files = mutateCsv(files, 'members.csv', 2, 'adminUsers', 'alice@example.org')
  files = mutateCsv(files, 'posts.csv', 1, 'code', '123e4567-e89b-12d3-a456-426614174000')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
})

test('requires an administrator for every non-deleted member', async () => {
  const example = await loadExampleFiles()
  const files = mutateCsv(example, 'members.csv', 1, 'adminUsers', '')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.ok(resultCodes(result).includes('REQUIRED_FIELD'), JSON.stringify(result))
})

test('enforces limits, deleted balances, complete history, and aggregate zero', async (t) => {
  const example = await loadExampleFiles()
  const cases = [
    ['credit limit', (files: typeof example) =>
      mutateCsv(files, 'members.csv', 1, 'account.creditLimit', '4.99'), 'ACCOUNT_LIMIT'],
    ['deleted balance', (files: typeof example) =>
      mutateCsv(files, 'members.csv', 1, 'status', 'deleted'), 'DELETED_ACCOUNT_BALANCE'],
    ['incomplete transfer history', (files: typeof example) =>
      mutateCsv(files, 'transfers.csv', 1, 'amount', '4.00'), 'BALANCE_MISMATCH'],
    ['non-zero aggregate', (files: typeof example) =>
      mutateCsv(files, 'members.csv', 2, 'account.balance', '6.00'), 'NON_ZERO_TOTAL_BALANCE'],
  ] as const

  for (const [name, mutate, expectedCode] of cases) {
    await t.test(name, async () => {
      const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(mutate(example)) })
      assert.ok(resultCodes(result).includes(expectedCode), JSON.stringify(result))
    })
  }
})

test('uses the documented currency scale for every exact amount', async () => {
  const example = await loadExampleFiles()
  const files = mutateCsv(example, 'community.csv', 1, 'currency.scale', '3')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.plan.members[0].account?.balance, '-5000')
  assert.equal(result.plan.transfers[0].amount, '5000')
  assert.equal(result.plan.community.currency.settings.defaultInitialCreditLimit, '100000')
})

test('post image identity includes the ordered list position', async () => {
  const example = await loadExampleFiles()
  const first = mutateCsv(
    example,
    'posts.csv',
    1,
    'imageUrls',
    'https://example.org/one.jpg;https://example.org/two.jpg',
  )
  const second = mutateCsv(
    example,
    'posts.csv',
    1,
    'imageUrls',
    'https://example.org/two.jpg;https://example.org/one.jpg',
  )
  const firstResult = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(first) })
  const secondResult = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(second) })
  assert.equal(firstResult.success, true)
  assert.equal(secondResult.success, true)
  if (!firstResult.success || !secondResult.success) return

  const firstKeys = Object.fromEntries(firstResult.plan.images.map((item) => [item.sourceUrl, item.sourceKey]))
  const secondKeys = Object.fromEntries(secondResult.plan.images.map((item) => [item.sourceUrl, item.sourceKey]))
  assert.notEqual(firstKeys['https://example.org/one.jpg'], secondKeys['https://example.org/one.jpg'])
  assert.notEqual(firstKeys['https://example.org/two.jpg'], secondKeys['https://example.org/two.jpg'])
})

test('repeated image URLs remain distinct by list position', async () => {
  const example = await loadExampleFiles()
  const files = mutateCsv(
    example,
    'posts.csv',
    1,
    'imageUrls',
    'https://example.org/same.jpg;https://example.org/same.jpg',
  )
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
  if (!result.success) return
  const images = result.plan.images.filter(({ sourceUrl }) => sourceUrl === 'https://example.org/same.jpg')
  assert.deepStrictEqual(images.map(({ position }) => position), [0, 1])
  assert.notEqual(images[0].sourceKey, images[1].sourceKey)
})

test('optional categories and posts files may be omitted when unreferenced', async () => {
  const files = await loadExampleFiles()
  files.delete('categories.csv')
  files.delete('posts.csv')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true)
  if (!result.success) return
  assert.equal(result.summary.categories, 0)
  assert.equal(result.summary.offers, 0)
  assert.equal(result.summary.wants, 0)
})

test('semantic error ordering does not depend on ZIP entry order', async () => {
  const example = await loadExampleFiles()
  let files = mutateCsv(example, 'users.csv', 2, 'email', 'alice@example.org')
  files = mutateCsv(files, 'posts.csv', 1, 'categoryCode', 'missing')
  const forward = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  const reverse = await parseMigrationBundle({
    type: 'zip',
    bytes: await zipFromFiles(files, [...files.keys()].reverse()),
  })
  assert.equal(forward.success, false)
  assert.deepStrictEqual(reverse, forward)
})
