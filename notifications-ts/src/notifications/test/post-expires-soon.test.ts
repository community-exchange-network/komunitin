import assert from 'node:assert'
import { describe, it, before, beforeEach, afterEach } from 'node:test'
import { createOffer, getUserIdForMember, db } from '../../mocks/db'
import { mockDate, restoreDate } from '../../mocks/date'
import { setupNotificationsTest, verifyNotification } from './utils'

const { appNotifications, syntheticQueue: queue } = setupNotificationsTest({
  useAppChannel: true,
  useSyntheticQueue: true,
})

describe('Post expires soon (synthetic cron)', () => {
  let runPostExpirationCron: () => Promise<void>;
  let runNotifyPostExpiresSoon: (job: any) => Promise<void>;

  before(async () => {
    const { initPostEvents } = await import('../synthetic/post')
    const { handlers: postHandlers } = initPostEvents(queue as any)

    runPostExpirationCron = postHandlers['post-expiration-cron'];
    runNotifyPostExpiresSoon = postHandlers['notify-post-expires-soon'];
  })

  beforeEach(async () => {
    mockDate('2026-01-13T00:00:00.000Z')
  })

  afterEach(async () => {
    restoreDate()
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

    // 1) Run cron job to discover expiring posts (< 7d)
    await runPostExpirationCron()

    // 2) Assert the two jobs exist (7d immediate + 24h delayed)
    const job7dId = `post-expires-in-7d-${offer.id}`
    const job24hId = `post-expires-in-24h-${offer.id}`

    const job7d = await queue.getJob(job7dId)
    const job24h = await queue.getJob(job24hId)

    assert.ok(job7d, 'Expected the 7d notification job to be queued')
    assert.ok(job24h, 'Expected the 24h notification job to be queued')

    // In this test setup, expiry in 6d means the 24h job should be delayed by 5 days
    assert.equal(job24h.opts.delay, 5 * DAY)

    // 3) Process the 7d job and verify notification via HTTP endpoint
    await runNotifyPostExpiresSoon({ data: job7d.data } )

    assert.equal(appNotifications.length, 1)
    const notification = appNotifications[0]

    await verifyNotification(userId, groupCode, notification.id, {
      title: 'Offer expires in 6 days',
      body: "Extend your Offer 'Offer that will expire soon' to keep it visible to others.",
    })

    // 4) Run cron again and verify idempotency (no duplicate jobs / no duplicate send)
    await runPostExpirationCron()

    assert.equal(queue.add.mock.callCount(), 2, 'Should not enqueue duplicate jobs on re-run')
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
        created: new Date(now - 365 * DAY).toISOString(), // Ensure +30d expiry window
        expires: new Date(now + 3 * DAY).toISOString(),
      }
    })

    // 2) Run cron job
    await runPostExpirationCron()

    const job7dId = `post-expires-in-7d-${offer.id}`
    const job24hId = `post-expires-in-24h-${offer.id}`

    const job7d = await queue.getJob(job7dId)
    const job24h = await queue.getJob(job24hId)

    assert.ok(job7d, 'Expected 7d job')
    assert.ok(job24h, 'Expected 24h job')

    // 3) Process 7d job. It should send the notification.
    await runNotifyPostExpiresSoon({ data: job7d.data } )
    assert.equal(appNotifications.length, 1)

    // 4) Extend the post expiration to 30 days from now
    db.offers.find((o: any) => o.id === offer.id).attributes.expires = new Date(now + 30 * DAY).toISOString()

    // 5) Process the 24h job. It should NOT send a notification.
    appNotifications.length = 0 // Clear to see if a new one is added
    await runNotifyPostExpiresSoon({ data: job24h.data } )

    assert.equal(appNotifications.length, 0, 'Expected no notification to be sent as post was extended')
  })
})
