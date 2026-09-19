import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMigrationBundle } from '../../src/features/migrations/bundle/index'
import {
  loadExampleFiles,
  appendCsvRow,
  mutateCsv,
  resultCodes,
  zipFromFiles,
} from './migration-bundle-helpers'

test('reports representative semantic relationship and uniqueness failures', async (t) => {
  const example = await loadExampleFiles()
  const cases = [
    ['duplicate normalized email', (files: typeof example) =>
      mutateCsv(files, 'users.csv', 2, 'email', 'ALICE@EXAMPLE.ORG'), 'DUPLICATE_VALUE'],
    ['duplicate transfer id', (files: typeof example) =>
      appendCsvRow(files, 'transfers.csv', 1, {}), 'DUPLICATE_VALUE'],
    ['duplicate member code', (files: typeof example) =>
      appendCsvRow(files, 'members.csv', 1, {}), 'DUPLICATE_VALUE'],
    ['wrong community prefix', (files: typeof example) =>
      mutateCsv(files, 'members.csv', 1, 'code', 'OTHR10000'), 'INVALID_MEMBER_CODE'],
    ['duplicate member-user pair', (files: typeof example) =>
      appendCsvRow(files, 'member-users.csv', 1, { user: 'ALICE@EXAMPLE.ORG' }), 'DUPLICATE_VALUE'],
    ['unknown member relationship', (files: typeof example) =>
      mutateCsv(files, 'member-users.csv', 1, 'member', 'EXMP9999'), 'MISSING_REFERENCE'],
    ['unknown transfer user', (files: typeof example) =>
      mutateCsv(files, 'transfers.csv', 1, 'user', 'missing@example.org'), 'MISSING_REFERENCE'],
    ['unknown member owner', (files: typeof example) =>
      mutateCsv(files, 'member-users.csv', 1, 'user', 'missing@example.org'), 'MISSING_REFERENCE'],
    ['community admin without membership', (files: typeof example) => {
      let changed = mutateCsv(files, 'community.csv', 1, 'adminUsers', 'alice@example.org;bob@example.org')
      changed = mutateCsv(changed, 'member-users.csv', 2, 'user', 'alice@example.org')
      return changed
    }, 'ADMIN_NOT_MEMBER'],
    ['currency admin outside group admins', (files: typeof example) =>
      mutateCsv(files, 'community.csv', 1, 'adminUsers', 'bob@example.org'), 'INVALID_CURRENCY_ADMIN'],
    ['unknown transfer account', (files: typeof example) =>
      mutateCsv(files, 'transfers.csv', 1, 'payee', 'EXMP9999'), 'MISSING_ACCOUNT_REFERENCE'],
    ['self transfer', (files: typeof example) =>
      mutateCsv(files, 'transfers.csv', 1, 'payee', 'EXMP0001'), 'SELF_TRANSFER'],
    ['unknown category', (files: typeof example) =>
      mutateCsv(files, 'posts.csv', 1, 'category', 'missing'), 'MISSING_REFERENCE'],
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
  files = mutateCsv(files, 'transfers.csv', 1, 'id', '123e4567-e89b-12d3-a456-426614174000')
  files = mutateCsv(files, 'transfers.csv', 1, 'user', 'bob@example.org')
  files = mutateCsv(files, 'community.csv', 1, 'adminUsers', 'alice@example.org')
  files = mutateCsv(files, 'member-users.csv', 2, 'user', 'alice@example.org')
  files = mutateCsv(files, 'posts.csv', 1, 'code', '123e4567-e89b-12d3-a456-426614174000')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
})

test('requires a user relationship for every non-deleted member', async () => {
  const example = await loadExampleFiles()
  const files = mutateCsv(example, 'member-users.csv', 1, 'member', 'EXMP0002')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.ok(resultCodes(result).includes('MISSING_MEMBER_USER'), JSON.stringify(result))
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

test('preserves post image order without derived keys', async () => {
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

  const images = (plan: typeof firstResult.plan) => plan.images
    .filter(({ ownerType }) => ownerType === 'offer')
    .map(({ sourceUrl, position }) => ({ sourceUrl, position }))
  assert.deepStrictEqual(images(firstResult.plan), [
    { sourceUrl: 'https://example.org/one.jpg', position: 0 },
    { sourceUrl: 'https://example.org/two.jpg', position: 1 },
  ])
  assert.deepStrictEqual(images(secondResult.plan), [
    { sourceUrl: 'https://example.org/two.jpg', position: 0 },
    { sourceUrl: 'https://example.org/one.jpg', position: 1 },
  ])
  assert.ok(firstResult.plan.images.every((image) => !('sourceKey' in image)))
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
  assert.equal(result.summary.needs, 0)
})

test('semantic error ordering does not depend on ZIP entry order', async () => {
  const example = await loadExampleFiles()
  let files = mutateCsv(example, 'users.csv', 2, 'email', 'alice@example.org')
  files = mutateCsv(files, 'posts.csv', 1, 'category', 'missing')
  const forward = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  const reverse = await parseMigrationBundle({
    type: 'zip',
    bytes: await zipFromFiles(files, [...files.keys()].reverse()),
  })
  assert.equal(forward.success, false)
  assert.deepStrictEqual(reverse, forward)
})

test('supports several users per member and separate preferences for each membership', async () => {
  const example = await loadExampleFiles()
  const files = appendCsvRow(example, 'member-users.csv', 1, {
    member: 'EXMP0002',
    'notifications.group': 'false',
    'emails.group': 'never',
  })
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
  if (!result.success) return
  assert.equal(result.summary.users, 2)
  assert.equal(result.summary.memberUsers, 3)
  assert.deepStrictEqual(result.plan.members[1].account?.users, ['bob@example.org', 'alice@example.org'])
  const memberships = result.plan.memberUsers.filter(({ user }) => user === 'alice@example.org')
  assert.deepStrictEqual(memberships.map(({ notifications, emails }) => [notifications.group, emails.group]), [
    [true, 'weekly'], [false, 'never'],
  ])
})

test('requires member-users.csv even when a bundle supplies users.csv', async () => {
  const files = await loadExampleFiles()
  files.delete('member-users.csv')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, false)
  if (result.success) return
  assert.ok(result.errors.some(({ code, file }) => code === 'MISSING_FILE' && file === 'member-users.csv'))
})

test('accepts long numeric and custom account codes throughout bundle relationships', async (t) => {
  const example = await loadExampleFiles()
  for (const code of ['EXMP10000', 'EXMPSpecial']) {
    await t.test(code, async () => {
      const files = new Map([...example].map(([filename, data]) => [
        filename, Buffer.from(data.toString('utf8').replaceAll('EXMP0001', code)),
      ]))
      const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
      assert.equal(result.success, true, JSON.stringify(result))
      if (!result.success) return
      assert.equal(result.plan.members[0].code, code)
      assert.equal(result.plan.members[0].account?.code, code)
      assert.equal(result.plan.memberUsers[0].member, code)
      assert.equal(result.plan.transfers[0].payer, code)
      assert.equal(result.plan.posts[0].member, code)
    })
  }
})

test('derives deleted member timestamps from their last update', async () => {
  const example = await loadExampleFiles()
  const files = appendCsvRow(example, 'members.csv', 1, {
    code: 'EXMPOld',
    status: 'deleted',
    updatedAt: '2025-03-01T12:00:00+01:00',
    'account.balance': '0',
  })
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
  if (!result.success) return
  const member = result.plan.members[2]
  assert.equal(member.deleted, '2025-03-01T11:00:00.000Z')
  assert.equal(member.deleted, member.updatedAt)
  assert.equal(member.account?.status, 'deleted')
  assert.deepStrictEqual(member.account?.users, [])
})

test('preserves disabled identities without changing their member status or history', async () => {
  const example = await loadExampleFiles()
  const files = mutateCsv(example, 'users.csv', 1, 'status', 'disabled')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
  if (!result.success) return
  assert.equal(result.plan.users[0].status, 'disabled')
  assert.equal(result.plan.members[0].status, 'active')
  assert.equal(result.plan.transfers[0].user, 'alice@example.org')
})

test('preserves API-compatible account settings and explicit empty whitelists', async () => {
  let files = await loadExampleFiles()
  files = mutateCsv(files, 'members.csv', 1, 'account.settings.acceptPaymentsAfter', '0')
  files = mutateCsv(files, 'members.csv', 1, 'account.settings.onPaymentCreditLimit', '0.25')
  files = mutateCsv(files, 'community.csv', 1, 'currency.settings.defaultAcceptPaymentsAfter', 'false')
  files = mutateCsv(files, 'community.csv', 1, 'currency.settings.defaultOnPaymentCreditLimit', 'false')
  files = mutateCsv(files, 'community.csv', 1, 'currency.settings.defaultAcceptPaymentsWhitelist', 'EXMP0002')
  const result = await parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })
  assert.equal(result.success, true, JSON.stringify(result))
  if (!result.success) return
  const settings = result.plan.members[0].account!.settings
  assert.equal(settings.acceptPaymentsAfter, 0)
  assert.equal(settings.onPaymentCreditLimit, '25')
  assert.deepStrictEqual(settings.acceptPaymentsWhitelist, [])
  assert.equal(result.plan.community.currency.settings.defaultAcceptPaymentsAfter, false)
  assert.equal(result.plan.community.currency.settings.defaultOnPaymentCreditLimit, false)
  assert.deepStrictEqual(result.plan.community.currency.settings.defaultAcceptPaymentsWhitelist, ['EXMP0002'])
})
