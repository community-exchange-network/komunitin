import assert from 'node:assert'
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import { setupServer } from 'msw/node'

import handlers from '../../mocks/handlers'
import { generateKeys } from '../../mocks/auth'
import { mockDb } from '../../mocks/prisma'
import { createQueue } from '../../mocks/queue'
import { createOffer, createNeed, getUserIdForMember, resetDb, db } from '../../mocks/db'
import { mockDate, restoreDate } from '../../mocks/date'
import { verifyNotification } from './utils'

import { mockRedis } from '../../mocks/redis'

const server = setupServer(...handlers)
mockRedis()

// Mock prisma table used by app channel + HTTP endpoint
const { appNotification } = mockDb()

describe('Member has expired posts (synthetic cron)', () => {
  let stopAppChannel: (() => void) | null = null
  let runPostExpirationCron: () => Promise<void>;
  let runNotifyMemberHasExpiredPosts: (data: any) => Promise<void>;
  const queue = createQueue("synthetic-events");

  before(async () => {
    await generateKeys()
    server.listen({ onUnhandledRequest: 'bypass' })
    const { initPostEvents } = await import('../synthetic/post')
    const { handlers: postHandlers } = initPostEvents(queue as any)

    runPostExpirationCron = postHandlers['post-expiration-cron'];
    runNotifyMemberHasExpiredPosts = postHandlers['notify-member-has-expired-posts'];

  })

  after(() => {
    server.close()
  })

  beforeEach(async () => {
    resetDb()
    queue.resetMocks()
    appNotification.length = 0

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

    // 1) Run cron to discover expired posts and schedule member reminder
    await runPostExpirationCron()

    // Expired 1 day ago => reminder should be delayed until the 7-day boundary => 6 days
    const jobId = `member-has-expired-posts:${memberId}`
    const job = await queue.getJob(jobId)

    assert.ok(job, 'Expected the expired-posts job to be queued')
    assert.equal(job.name, 'notify-member-has-expired-posts')
    assert.equal(job.opts.delay, 6 * DAY)

    // 2) Process the job and verify notification via HTTP endpoint
    await runNotifyMemberHasExpiredPosts({ data: job.data } )

    assert.equal(appNotification.length, 1)
    const notification = appNotification[0]

    await verifyNotification(userId, groupCode, notification.id, {
      title: 'Offer expired 1 day ago',
      body: 'Your offer "Old expired offer" was hidden 1 day ago. Extend it to make it visible again.',
    })

    // 3) Re-run cron and verify it replaces (reschedules) the same job without creating extra notifications
    await runPostExpirationCron()

    const jobAfter = await queue.getJob(jobId)
    assert.ok(jobAfter, 'Expected the expired-posts job to still exist after rescheduling')
    assert.equal(jobAfter.opts.delay, 6 * DAY)

    // Because this job is scheduled with replace=true, the second run removes and re-adds it.
    assert.equal(queue.add.mock.callCount(), 2)
    assert.equal(appNotification.length, 1)
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

    // Run cron
    await runPostExpirationCron()

    // 2) Check that a notification is scheduled for 30d after expiry (5 days from now)
    const job1 = await queue.getJob(jobId)
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
    await runPostExpirationCron()

    // Check that now there is only one notification scheduled for 7d after the new expiry (6 days delay)
    // 7 - 1 = 6 days. 6 < 7 so it is scheduled.
    const job2 = await queue.getJob(jobId)
    assert.ok(job2, 'Expected job to exist')
    assert.equal(job2.opts.delay, 6 * DAY)
    assert.equal(job2.data.id, newOffer.id, 'Expected the job to be related to the new offer')

    // Ensure only one job exists in the mock storage (idempotency/replacement)
    assert.equal(queue.add.mock.callCount(), 2, 'Should have called add twice (once for each cron run)')
  })

  it('updates notification text as more expired posts (offers and needs) are added', async () => {
    const groupCode = 'GRP1'
    const DAY = 24 * 60 * 60 * 1000
    const now = Date.now()

    // Helper to run cron, process job and return the notification
    const getNotification = async (mId: string) => {
      // 1) Run cron to discover expired posts and schedule member reminder
      await runPostExpirationCron()
      // 2) Process the job
      const jobId = `member-has-expired-posts:${mId}`
      const job = await queue.getJob(jobId)
      if (!job) return null

      appNotification.length = 0
      await runNotifyMemberHasExpiredPosts({ data: job.data } )
      return appNotification[0]
    }

    // SCENARIO 1: Only one expired need (1 day ago)
    const need1 = createNeed({
      groupCode,
      id: 'need-1',
      code: 'NEED1',
      attributes: {
        content: 'Need 1 content',
        expires: new Date(now - 1 * DAY - 1000).toISOString(),
      },
    })
    const memberId = need1.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    let notification = await getNotification(memberId)
    assert.ok(notification)
    await verifyNotification(userId, groupCode, notification.id, {
      title: 'Need expired 1 day ago',
      body: 'Your need "Need 1 content" was hidden 1 day ago. Extend it to make it visible again.',
    })

    // SCENARIO 2: An expired offer (featured, 1 day ago) + 1 expired need (older, 2 days ago)
    // Make need1 older
    db.needs.find((n: any) => n.id === 'need-1').attributes.expires = new Date(now - 2 * DAY).toISOString()
    // Add a more recent offer
    createOffer({
      groupCode,
      id: 'offer-1',
      code: 'OFFER1',
      memberId,
      attributes: {
        name: 'Offer 1',
        expires: new Date(now - 1 * DAY).toISOString(),
      },
    })

    notification = await getNotification(memberId)
    assert.ok(notification)
    await verifyNotification(userId, groupCode, notification.id, {
      title: 'Offer expired 1 day ago and 1 more',
    })
    assert.equal(notification.body, 'Your offer "Offer 1" was hidden 1 day ago. Extend it to make it visible again. You have expired 1 need more to review.')

    // SCENARIO 3: An expired need (featured, 1 day ago) + 2 expired needs + 2 expired offers
    // Featured (Need F, 1d)
    // Extra Needs (Need 1 [2d], Need 2 [3d]) -> 2 extra
    // Extra Offers (Offer 1 [5d], Offer 2 [4d]) -> 2 extra
    // Total: 5 items. 4 "more".

    // Refresh existing:
    db.needs.find((n: any) => n.id === 'need-1').attributes.expires = new Date(now - 2 * DAY).toISOString()
    db.offers.find((o: any) => o.id === 'offer-1').attributes.expires = new Date(now - 5 * DAY).toISOString()

    // Add new ones:
    createNeed({
      groupCode,
      id: 'need-featured',
      code: 'NEEDF',
      memberId,
      attributes: {
        content: 'Need Featured content',
        expires: new Date(now - 1 * DAY).toISOString(), // Most recent
      },
    })
    // Move Offer 1 to be older than Need Featured
    db.offers.find((o: any) => o.id === 'offer-1').attributes.expires = new Date(now - 1 * DAY - 1000).toISOString()

    createNeed({
      groupCode,
      id: 'need-2',
      code: 'NEED2',
      memberId,
      attributes: {
        content: 'Need 2 content',
        expires: new Date(now - 3 * DAY).toISOString(),
      },
    })
    createOffer({
      groupCode,
      id: 'offer-2',
      code: 'OFFER2',
      memberId,
      attributes: {
        name: 'Offer 2',
        expires: new Date(now - 4 * DAY).toISOString(),
      },
    })

    notification = await getNotification(memberId)
    assert.ok(notification)
    await verifyNotification(userId, groupCode, notification.id, {
      title: 'Need expired 1 day ago and 4 more',
      body: 'Your need "Need Featured content" was hidden 1 day ago. Extend it to make it visible again. You have expired 2 offers and 2 needs more to review.',
    })
  })
})
