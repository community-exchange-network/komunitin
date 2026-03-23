import assert from 'node:assert'
import { afterEach, before, describe, it } from 'node:test'
import { mockDate, restoreDate } from '../../mocks/date'
import { createNeed, createOffer, db, getUserIdForMember } from '../../mocks/db'
import { createEvent, daysAgo, setupNotificationsTest } from './utils'
import { NotifyExpiryData } from '../synthetic/post'
import { Job } from 'bullmq/dist/esm/classes/job'

const { put, email, appNotifications, syntheticQueue: queue } = setupNotificationsTest({
  useWorker: true,
  useSyntheticQueue: true,
})

describe('MemberHasExpiredPostsRecently email notifications', () => {
  let runPostExpirationCron: () => Promise<void>
  let runNotifyMemberHasExpiredPosts: (job: Job<NotifyExpiryData>) => Promise<void>
  let runNotifyMemberHasExpiredPostsRecently: (job: Job<NotifyExpiryData>) => Promise<void>

  before(async () => {
    const { initPostEvents } = await import('../synthetic/post')
    const { handlers: postHandlers } = initPostEvents(queue as any)

    runPostExpirationCron = postHandlers['post-expiration-cron']
    runNotifyMemberHasExpiredPosts = postHandlers['notify-member-has-expired-posts']
    runNotifyMemberHasExpiredPostsRecently = postHandlers['notify-member-has-expired-posts-recently']
  })

  afterEach(() => {
    restoreDate()
  })

  it('sends an email for recently expired posts with featured post and additional expired items', async () => {
    mockDate('2026-01-13T00:00:00.000Z')
    const groupCode = 'GRP1'

    const featuredOffer = createOffer({
      groupCode,
      id: 'offer-email-featured',
      code: 'OFFEMAIL1',
      attributes: {
        name: 'Recent expired offer',
        created: daysAgo(30),
        expires: daysAgo(1),
      },
    })

    const memberId = featuredOffer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    createNeed({
      groupCode,
      id: 'need-email-old-1',
      code: 'NDEMAIL1',
      memberId,
      attributes: {
        content: 'Older expired need',
        expires: daysAgo(5),
      },
    })

    createOffer({
      groupCode,
      id: 'offer-email-old-2',
      code: 'OFFEMAIL2',
      memberId,
      attributes: {
        name: 'Older expired offer',
        expires: daysAgo(10),
      },
    })

    const event = createEvent('MemberHasExpiredPostsRecently', {
      code: groupCode,
      user: userId,
      data: { member: memberId },
    })

    await put(event)

    assert.equal(email.sentEmails.length, 1)
    const sentEmail = email.lastEmail()
    assert.ok(sentEmail.subject.includes('expired'))
    assert.ok(sentEmail.html.includes('Recent expired offer'))
    assert.ok(sentEmail.html.includes('Other expired posts'))
    assert.ok(sentEmail.html.includes('Older expired need'))
    assert.ok(sentEmail.html.includes(featuredOffer.attributes.images?.[0] ?? ''))

    assert.equal(appNotifications.length, 0, 'In-app channel should not handle MemberHasExpiredPostsRecently')
  })

  it('does not send email for MemberHasExpiredPosts event', async () => {
    mockDate('2026-01-13T00:00:00.000Z')
    const groupCode = 'GRP1'

    const offer = createOffer({
      groupCode,
      id: 'offer-expired',
      code: 'OFFEXPIRED',
      attributes: {
        name: 'Expired offer',
        created: daysAgo(20),
        expires: daysAgo(1),
      },
    })

    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    const event = createEvent('MemberHasExpiredPosts', {
      code: groupCode,
      user: userId,
      data: { member: memberId },
    })

    await put(event)

    assert.equal(email.sentEmails.length, 0)
  })

  it('does not send email when member has no posts expired in last 48h', async () => {
    mockDate('2026-01-13T00:00:00.000Z')
    const groupCode = 'GRP1'

    const offer = createOffer({
      groupCode,
      id: 'offer-email-stale',
      code: 'OFFSTALE',
      attributes: {
        name: 'Stale expired offer',
        created: daysAgo(40),
        expires: daysAgo(3),
      },
    })

    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)

    const event = createEvent('MemberHasExpiredPostsRecently', {
      code: groupCode,
      user: userId,
      data: { member: memberId },
    })

    await put(event)

    assert.equal(email.sentEmails.length, 0)
  })

  it('does not send notifications if offer expiry is extended before synthetic events are processed', async () => {
    mockDate('2026-01-13T00:00:00.000Z')
    const groupCode = 'GRP1'
    const DAY = 24 * 60 * 60 * 1000

    const offer = createOffer({
      groupCode,
      id: 'offer-expired-extended-before-send',
      code: 'OFFEXTENDED',
      attributes: {
        name: 'Soon-to-be-extended offer',
        created: daysAgo(5),
        expires: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      },
    })

    const memberId = offer.relationships.member.data.id

    await runPostExpirationCron()

    const recentJobId = `member-has-expired-posts-recently-${memberId}`
    const regularJobId = `member-has-expired-posts-${memberId}`
    const recentJob = await queue.getJob(recentJobId)
    const regularJob = await queue.getJob(regularJobId)

    assert.ok(recentJob, 'Expected MemberHasExpiredPostsRecently synthetic job to be queued')
    assert.ok(regularJob, 'Expected MemberHasExpiredPosts synthetic job to be queued')
    assert.equal(recentJob.opts.delay, 12 * 60 * 60 * 1000)
    assert.equal(regularJob.opts.delay, 6.5 * DAY)

    // Member extends the offer before the synthetic jobs fire.
    const dbOffer = db.offers.find((o: any) => o.id === offer.id)
    assert.ok(dbOffer)
    dbOffer.attributes.expires = new Date(Date.now() + 7 * DAY).toISOString()

    await runNotifyMemberHasExpiredPostsRecently(recentJob)
    await runNotifyMemberHasExpiredPosts(regularJob)

    assert.equal(email.sentEmails.length, 0)
    assert.equal(appNotifications.length, 0)
  })
})
