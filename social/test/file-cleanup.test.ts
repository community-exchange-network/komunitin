import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { cleanupUnlinkedFiles } from '../src/features/files/cleanup'
import { privilegedDb } from '../src/server/multitenant'
import logger from '../src/utils/logger'
import prisma from '../src/utils/prisma'
import { getS3DeleteRequests, setS3DeleteError } from './mocks/s3'
import { resetDb, seedFile, seedGroup, seedMember, seedPost } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { toUuid } from './mocks/utils'

const DAY_MS = 24 * 60 * 60 * 1000

const daysAgo = (days: number): Date => {
  return new Date(Date.now() - days * DAY_MS)
}

const db = () => privilegedDb(prisma)
let resetMocks: () => void

before(async () => {
  const server = await setupTestServer()
  resetMocks = server.resetMocks
})

after(async () => {
  await teardownTestServer()
})

describe('Unlinked file cleanup', () => {
  beforeEach(async () => {
    resetMocks()
    await resetDb()
  })

  test('deletes old unlinked files from S3 and the database', async () => {
    const file = await seedFile({
      tenantId: 'cleanup-old',
      resourceType: 'members',
      updated: daysAgo(31),
    })

    const stats = await cleanupUnlinkedFiles()

    assert.strictEqual(stats.candidates, 1)
    assert.strictEqual(stats.deleted, 1)
    assert.strictEqual(await db().file.findUnique({ where: { id: file.id } }), null)
    assert.deepStrictEqual(getS3DeleteRequests().map((url) => new URL(url).pathname), [
      `/uploads/${file.key}`,
    ])
  })

  test('retains recently updated unlinked files', async () => {
    const file = await seedFile({
      tenantId: 'cleanup-recent',
      resourceType: 'members',
      updated: daysAgo(1),
    })

    const stats = await cleanupUnlinkedFiles()

    assert.strictEqual(stats.candidates, 0)
    assert.strictEqual(stats.deleted, 0)
    assert.ok(await db().file.findUnique({ where: { id: file.id } }))
    assert.deepStrictEqual(getS3DeleteRequests(), [])
  })

  test('retains linked files', async () => {
    const file = await seedFile({
      tenantId: 'cleanup-linked',
      resourceType: 'members',
      resourceId: toUuid('cleanup-linked-member'),
      updated: daysAgo(31),
    })

    const stats = await cleanupUnlinkedFiles()

    assert.strictEqual(stats.candidates, 0)
    assert.strictEqual(stats.deleted, 0)
    assert.ok(await db().file.findUnique({ where: { id: file.id } }))
    assert.deepStrictEqual(getS3DeleteRequests(), [])
  })

  test('retains and warns when an unlinked file is still referenced by live resource JSON', async () => {
    const tenantId = 'cleanup-live-reference'
    const url = 'http://komunitin.s3.test/uploads/cleanup-live-reference/groups/image.png'
    await seedGroup({
      tenantId,
      image: { url, alt: 'Still referenced' },
    })
    const file = await seedFile({
      tenantId,
      resourceType: 'groups',
      key: 'cleanup-live-reference/groups/image.png',
      url,
      updated: daysAgo(31),
    })

    const originalWarn = logger.warn
    const warnings: unknown[][] = []
    logger.warn = ((...args: unknown[]) => {
      warnings.push(args)
    }) as typeof logger.warn

    try {
      const stats = await cleanupUnlinkedFiles()

      assert.strictEqual(stats.candidates, 1)
      assert.strictEqual(stats.deleted, 0)
      assert.strictEqual(stats.skippedReferenced, 1)
      assert.ok(await db().file.findUnique({ where: { id: file.id } }))
      assert.deepStrictEqual(getS3DeleteRequests(), [])
      assert.ok(warnings.some(([context, message]) =>
        typeof context === 'object' &&
        context !== null &&
        (context as Record<string, unknown>).fileId === file.id &&
        (context as Record<string, unknown>).tenantId === tenantId &&
        String(message).includes('Unlinked file is still referenced by a live resource')
      ))
    } finally {
      logger.warn = originalWarn
    }
  })

  test('deletes unlinked files when only deleted resources still reference them', async () => {
    const tenantId = 'cleanup-deleted-reference'
    const url = 'http://komunitin.s3.test/uploads/cleanup-deleted-reference/groups/image.png'
    await seedGroup({
      tenantId,
      image: { url, alt: 'Deleted group image' },
      deleted: new Date(),
    })
    const file = await seedFile({
      tenantId,
      resourceType: 'groups',
      key: 'cleanup-deleted-reference/groups/image.png',
      url,
      updated: daysAgo(31),
    })

    const stats = await cleanupUnlinkedFiles()

    assert.strictEqual(stats.candidates, 1)
    assert.strictEqual(stats.deleted, 1)
    assert.strictEqual(await db().file.findUnique({ where: { id: file.id } }), null)
    assert.strictEqual(getS3DeleteRequests().length, 1)
  })

  test('detects live member and post image references defensively', async () => {
    const tenantId = 'cleanup-member-post-reference'
    await seedGroup({ tenantId })
    const memberImage = 'http://komunitin.s3.test/uploads/cleanup-member-post-reference/members/image.png'
    const postImage = 'http://komunitin.s3.test/uploads/cleanup-member-post-reference/offers/image.png'
    const member = await seedMember({
      tenantId,
      image: { url: memberImage, alt: 'Member image' },
    })
    await seedPost({
      tenantId,
      memberId: member.id,
      images: [{ url: postImage, alt: 'Post image' }],
    })
    const memberFile = await seedFile({
      tenantId,
      resourceType: 'members',
      key: 'cleanup-member-post-reference/members/image.png',
      url: memberImage,
      updated: daysAgo(31),
    })
    const postFile = await seedFile({
      tenantId,
      resourceType: 'offers',
      key: 'cleanup-member-post-reference/offers/image.png',
      url: postImage,
      updated: daysAgo(31),
    })

    const originalWarn = logger.warn
    logger.warn = (() => {}) as typeof logger.warn

    try {
      const stats = await cleanupUnlinkedFiles()

      assert.strictEqual(stats.candidates, 2)
      assert.strictEqual(stats.deleted, 0)
      assert.strictEqual(stats.skippedReferenced, 2)
      assert.ok(await db().file.findUnique({ where: { id: memberFile.id } }))
      assert.ok(await db().file.findUnique({ where: { id: postFile.id } }))
      assert.deepStrictEqual(getS3DeleteRequests(), [])
    } finally {
      logger.warn = originalWarn
    }
  })

  test('keeps the database row when S3 deletion fails', async () => {
    const file = await seedFile({
      tenantId: 'cleanup-s3-failure',
      resourceType: 'members',
      updated: daysAgo(31),
    })
    setS3DeleteError()

    const stats = await cleanupUnlinkedFiles()

    assert.strictEqual(stats.candidates, 1)
    assert.strictEqual(stats.deleted, 0)
    assert.strictEqual(stats.failed, 1)
    assert.ok(await db().file.findUnique({ where: { id: file.id } }))
    assert.ok(getS3DeleteRequests().length >= 1)
  })
})
