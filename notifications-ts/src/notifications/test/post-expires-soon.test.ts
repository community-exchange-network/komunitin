import assert from 'node:assert'
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import { setupServer } from 'msw/node'

import handlers from '../../mocks/handlers'
import { generateKeys } from '../../mocks/auth'
import prisma from '../../utils/prisma'
import { mockTable } from '../../mocks/prisma'
import { createMockQueue, resetQueueMocks, queueAdd, queueGetJob } from '../../mocks/queue'
import { createOffer, getUserIdForMember, resetDb, db } from '../../mocks/db'
import { mockDate, restoreDate } from '../../mocks/date'
import { verifyNotification } from './utils'

const server = setupServer(...handlers)

// Mock prisma table used by app channel + HTTP endpoint
const appNotifications = mockTable(prisma.appNotification, 'test-notification')

describe('Post expires soon (synthetic cron)', () => {
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

  it('discovers an expiring post, sends the 7d notification, schedules the 24h one, and is idempotent', async () => {
    const groupCode = 'GRP1'

    const DAY = 24 * 60 * 60 * 1000
    const now = Date.now()
    const offer = createOffer({
      groupCode,
      id: 'offer-expiring-soon-GRP1',
      code: 'OFFEREXPR',
      attributes: {
        name: 'Offer that will expire soon',
        created: new Date(now - 40 * DAY).toISOString(),
        expires: new Date(now + 6 * DAY).toISOString(),
      }
    })

    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    const queue = createMockQueue() as any
    const { initPostEvents } = await import('../synthetic/post')
    const { handlers: postHandlers } = initPostEvents(queue)

    // 1) Run cron job to discover expiring posts (< 7d)
    await postHandlers['check-post-expirations']()

    // 2) Assert the two jobs exist (7d immediate + 24h delayed)
    const job7dId = `post-expires-in-7d:${offer.id}`
    const job24hId = `post-expires-in-24h:${offer.id}`

    const job7d = await queueGetJob(job7dId)
    const job24h = await queueGetJob(job24hId)

    assert.ok(job7d, 'Expected the 7d notification job to be queued')
    assert.ok(job24h, 'Expected the 24h notification job to be queued')

    // In this test setup, expiry in 6d means the 24h job should be delayed by 5 days
    assert.equal(job24h.opts.delay, 5 * DAY)

    // 3) Process the 7d job and verify notification via HTTP endpoint
    await postHandlers['notify-post-expires-soon']({ data: job7d.data } as any)

    assert.equal(appNotifications.length, 1)
    const notification = appNotifications[0]

    await verifyNotification(userId, groupCode, notification.id, {
      title: 'Offer expires in 6 days',
      body: "Extend your Offer 'Offer that will expire soon · Spero turbo agnosco…' to keep it visible to others.",
    })

    // 4) Run cron again and verify idempotency (no duplicate jobs / no duplicate send)
    await postHandlers['check-post-expirations']()

    assert.equal(queueAdd.mock.callCount(), 2, 'Should not enqueue duplicate jobs on re-run')
    assert.equal(appNotifications.length, 1, 'Should not create a duplicate notification on re-run')
  })

  it('cancels the 24h notification if the post is extended before the job runs', async () => {
    const groupCode = 'GRP1'
    const DAY = 24 * 60 * 60 * 1000
    const now = Date.now()

    // 1) Set a post expiring in 3 days ( < 7 days but > 24h)
    const offer = createOffer({
      groupCode,
      id: 'offer-extensible',
      code: 'OFFEREXT',
      attributes: {
        name: 'Extensible Offer',
        expires: new Date(now + 3 * DAY).toISOString(),
      }
    })

    const queue = createMockQueue() as any
    const { initPostEvents } = await import('../synthetic/post')
    const { handlers: postHandlers } = initPostEvents(queue)

    // 2) Run cron job
    await postHandlers['check-post-expirations']()

    const job7dId = `post-expires-in-7d:${offer.id}`
    const job24hId = `post-expires-in-24h:${offer.id}`

    const job7d = await queueGetJob(job7dId)
    const job24h = await queueGetJob(job24hId)

    assert.ok(job7d, 'Expected 7d job')
    assert.ok(job24h, 'Expected 24h job')

    // 3) Process 7d job. It should send the notification.
    await postHandlers['notify-post-expires-soon']({ data: job7d.data } as any)
    assert.equal(appNotifications.length, 1)

    // 4) Extend the post expiration to 30 days from now
    db.offers.find((o: any) => o.id === offer.id).attributes.expires = new Date(now + 30 * DAY).toISOString()

    // 5) Process the 24h job. It should NOT send a notification.
    appNotifications.length = 0 // Clear to see if a new one is added
    await postHandlers['notify-post-expires-soon']({ data: job24h.data } as any)

    assert.equal(appNotifications.length, 0, 'Expected no notification to be sent as post was extended')
  })
})
