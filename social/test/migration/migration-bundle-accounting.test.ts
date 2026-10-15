import assert from 'node:assert/strict'
import test from 'node:test'
import { parseMigrationBundle } from '../../src/features/migrations/bundle'
import { loadExampleFiles, mutateCsv, zipFromFiles } from './migration-bundle-helpers'

type Files = Awaited<ReturnType<typeof loadExampleFiles>>
const parseFiles = async (files: Files) => parseMigrationBundle({ type: 'zip', bytes: await zipFromFiles(files) })

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
