import assert from 'node:assert'
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import { setupServer } from 'msw/node'

import handlers from '../../mocks/handlers'
import { generateKeys } from '../../mocks/auth'
import prisma from '../../utils/prisma'
import { mockTable } from '../../mocks/prisma'
import { createMockQueue, resetQueueMocks, queueAdd, queueGetJob } from '../../mocks/queue'
import { createOffer, getUserIdForMember, resetDb } from '../../mocks/db'
import { mockDate, restoreDate } from '../../mocks/date'
import { verifyNotification } from './utils'

const server = setupServer(...handlers)

// Mock prisma table used by app channel + HTTP endpoint
const appNotifications = mockTable(prisma.appNotification, 'test-notification')

describe('Member has expired posts (synthetic cron)', () => {
  let stopAppChannel: (() => void) | null = null

  before(async () => {
    await generateKeys()
    server.listen({ onUnhandledRequest: 'bypass' })
  })

  after(() => {
    server.close()
  })

  beforeEach(async () => {
    resetDb()
    resetQueueMocks()
    appNotifications.length = 0

    mockDate('2026-01-13T00:00:00.000Z')

    const { initInAppChannel } = await import('../channels/app')
    stopAppChannel = initInAppChannel()
  })

  afterEach(async () => {
    restoreDate()
    if (stopAppChannel) {
      stopAppChannel()
      stopAppChannel = null
    }
  })

  it('discovers a member with an expired offer, queues a reminder with the expected delay, sends an in-app notification, and reschedules on re-run', async () => {
    const groupCode = 'GRP1'

    const DAY = 24 * 60 * 60 * 1000
    const now = Date.now()

    const offer = createOffer({
      groupCode,
      id: 'offer-expired-GRP1',
      code: 'OFFEREXPRD',
      attributes: {
        name: 'Old expired offer',
        created: new Date(now - 40 * DAY).toISOString(),
        expires: new Date(now - 1 * DAY).toISOString(),
      },
    })

    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    const queue = createMockQueue() as any
    const { initPostEvents } = await import('../synthetic/post')
    const { handlers: postHandlers } = initPostEvents(queue)

    // 1) Run cron job to discover expired posts and schedule per-member reminder
    await postHandlers['check-post-expirations']()

    // Expired 1 day ago => reminder should be delayed until the 7-day boundary => 6 days
    const jobId = `member-has-expired-posts:${memberId}`
    const job = await queueGetJob(jobId)

    assert.ok(job, 'Expected the expired-posts job to be queued')
    assert.equal(job.name, 'notify-member-has-expired-posts')
    assert.equal(job.opts.delay, 6 * DAY)

    // 2) Process the job and verify notification via HTTP endpoint
    await postHandlers['notify-member-has-expired-posts']({ data: job.data } as any)

    assert.equal(appNotifications.length, 1)
    const notification = appNotifications[0]

    await verifyNotification(userId, groupCode, notification.id, {
      title: 'Offer expired 1 day ago',
      body: 'Your offer "Old expired offer" has been hidden for 1 day ago. Extend it to make it visible again.',
    })

    // 3) Re-run cron and verify it replaces (reschedules) the same job without creating extra notifications
    await postHandlers['check-post-expirations']()

    const jobAfter = await queueGetJob(jobId)
    assert.ok(jobAfter, 'Expected the expired-posts job to still exist after rescheduling')
    assert.equal(jobAfter.opts.delay, 6 * DAY)

    // Because this job is scheduled with replace=true, the second run removes and re-adds it.
    assert.equal(queueAdd.mock.callCount(), 2)
    assert.equal(appNotifications.length, 1)
  })

  it('ensures a more recent expiration supersedes older ones for the same member', async () => {
    const groupCode = 'GRP1'
    const DAY = 24 * 60 * 60 * 1000
    const now = Date.now()

    // 1) Have an offer expired 25 days ago
    // We use 25 days instead of 10 because the implementation only schedules jobs 
    // that are due within the next 7 days. (30 - 25 = 5 days delay < 7 days).
    const oldOffer = createOffer({
      groupCode,
      id: 'offer-expired-25d-ago',
      code: 'OFFEROLD',
      attributes: {
        name: 'Old offer (25d ago)',
        created: new Date(now - 60 * DAY).toISOString(),
        expires: new Date(now - 25 * DAY).toISOString(),
      },
    })

    const memberId = oldOffer.relationships.member.data.id
    const jobId = `member-has-expired-posts:${memberId}`

    const queue = createMockQueue() as any
    const { initPostEvents } = await import('../synthetic/post')
    const { handlers: postHandlers } = initPostEvents(queue)

    // Run cron
    await postHandlers['check-post-expirations']()

    // 2) Check that a notification is scheduled for 30d after expiry (5 days from now)
    const job1 = await queueGetJob(jobId)
    assert.ok(job1, 'Expected job for old offer')
    assert.equal(job1.opts.delay, 5 * DAY)
    assert.equal(job1.data.id, oldOffer.id)

    // 3) Add now an offer expired yesterday (1 day ago)
    const newOffer = createOffer({
      groupCode,
      id: 'offer-expired-yesterday',
      code: 'OFFERNEW',
      memberId, // Same member
      attributes: {
        name: 'New offer (yesterday)',
        created: new Date(now - 30 * DAY).toISOString(),
        expires: new Date(now - 1 * DAY).toISOString(),
      },
    })

    // 4) Run cron again
    await postHandlers['check-post-expirations']()

    // Check that now there is only one notification scheduled for 7d after the new expiry (6 days delay)
    // 7 - 1 = 6 days. 6 < 7 so it is scheduled.
    const job2 = await queueGetJob(jobId)
    assert.ok(job2, 'Expected job to exist')
    assert.equal(job2.opts.delay, 6 * DAY)
    assert.equal(job2.data.id, newOffer.id, 'Expected the job to be related to the new offer')

    // Ensure only one job exists in the mock storage (idempotency/replacement)
    assert.equal(queueAdd.mock.callCount(), 2, 'Should have called add twice (once for each cron run)')
  })
})
