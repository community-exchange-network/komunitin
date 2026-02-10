import assert from 'node:assert'
import { afterEach, before, describe, it } from 'node:test'
import { mockDate, restoreDate } from '../../mocks/date'
import { createMember, db, getUserIdForMember } from '../../mocks/db'
import { formatAmount } from '../../utils/format'
import { EVENT_NAME } from '../events'
import { setupNotificationsTest, subscribeToPushNotifications } from './utils'

const { appNotifications, pushQueue, syntheticQueue } = setupNotificationsTest({
  useWorker: true,
  usePushQueue: true,
  useSyntheticQueue: true,
})

let runEngagementCron: () => Promise<void>;

before(async () => {
  // Get the engagement cron handler so we can manually run it in tests
  const { initEngagementEvents } = await import('../synthetic/engagement')
  const { handlers } = initEngagementEvents(syntheticQueue as any)
  runEngagementCron = handlers['engagement-events-cron-job']
})

afterEach(() => {
  restoreDate()
})

const setupEngagementMember = async (groupCode: string, options: { balance: number; offers: number; needs: number }) => {
  const member = createMember({ groupCode })
  const userId = getUserIdForMember(member.id)

  const account = db.accounts.find(a => a.id === member.relationships.account.data.id)
  if (account) {
    account.attributes.balance = options.balance
  }

  member.relationships.offers = { meta: { count: options.offers } } as any
  member.relationships.needs = { meta: { count: options.needs } } as any

  await subscribeToPushNotifications(groupCode, userId)

  const currency = db.currencies.find(c => c.attributes.code === groupCode)!

  return { member, userId, currency }
}

describe('MemberHasNoPosts notifications', () => {
  it('sends no-offers notification via in-app and push when balance is negative', async () => {
    mockDate('2026-02-04T12:00:00.000Z')

    const groupCode = 'GRP1'
    const balance = -12345
    const { currency } = await setupEngagementMember(groupCode, {
      balance,
      offers: 0,
      needs: 0,
    })

    await runEngagementCron()

    const expectedBalance = formatAmount(balance, currency, 'en')

    assert.equal(appNotifications.length, 1)
    const notification = appNotifications[0]
    assert.equal(notification.eventName, EVENT_NAME.MemberHasNoPosts)
    assert.equal(notification.title, 'You have no active offers')
    assert.equal(
      notification.body,
      `Create one to help others and move your balance of ${expectedBalance} forward. What can you offer?`
    )

    assert.equal(pushQueue.add.mock.callCount(), 1)
    const [, jobData] = pushQueue.add.mock.calls[0].arguments
    assert.equal(jobData.message.title, notification.title)
    assert.equal(jobData.message.body, notification.body)
  })

  it('sends no-needs notification via in-app and push when balance is positive', async () => {
    mockDate('2026-02-06T12:00:00.000Z')

    const groupCode = 'GRP2'
    const balance = 98765
    const { currency } = await setupEngagementMember(groupCode, {
      balance,
      offers: 0,
      needs: 0,
    })

    await runEngagementCron()

    const expectedBalance = formatAmount(balance, currency, 'en')

    assert.equal(appNotifications.length, 1)
    const notification = appNotifications[0]
    assert.equal(notification.eventName, EVENT_NAME.MemberHasNoPosts)
    assert.equal(notification.title, `You have a balance of ${expectedBalance}`)
    assert.equal(
      notification.body,
      'Post a need to help others connect with you and use your balance. What do you need?'
    )

    assert.equal(pushQueue.add.mock.callCount(), 1)
    const [, jobData] = pushQueue.add.mock.calls[0].arguments
    assert.equal(jobData.message.title, notification.title)
    assert.equal(jobData.message.body, notification.body)
  })

  it('does not send when member has offers with negative balance', async () => {
    mockDate('2026-02-08T12:00:00.000Z')

    const groupCode = 'GRP3'
    await setupEngagementMember(groupCode, {
      balance: -5000,
      offers: 1,
      needs: 0,
    })

    await runEngagementCron()

    assert.equal(appNotifications.length, 0)
    assert.equal(pushQueue.add.mock.callCount(), 0)
  })

  it('respects 3-month cooldown and 7-day silence rules', async () => {
    mockDate('2026-02-10T12:00:00.000Z')

    const groupCode = 'GRP1'
    const { userId } = await setupEngagementMember(groupCode, {
      balance: -1200,
      offers: 0,
      needs: 0,
    })

    const now = new Date()
    const twoMonthsAgo = new Date(now)
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

    appNotifications.push({
      id: 'recent-engagement',
      userId,
      tenantId: groupCode,
      eventName: EVENT_NAME.MemberHasNoPosts,
      createdAt: twoMonthsAgo,
      updatedAt: twoMonthsAgo,
    })

    await runEngagementCron()

    assert.equal(appNotifications.length, 1)
    assert.equal(pushQueue.add.mock.callCount(), 0)

    appNotifications.length = 0
    pushQueue.add.mock.resetCalls()

    const fourMonthsAgo = new Date(now)
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4)
    const threeDaysAgo = new Date(now)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

    appNotifications.push({
      id: 'old-engagement',
      userId,
      tenantId: groupCode,
      eventName: EVENT_NAME.MemberHasNoPosts,
      createdAt: fourMonthsAgo,
      updatedAt: fourMonthsAgo,
    })
    appNotifications.push({
      id: 'recent-notification',
      userId,
      tenantId: groupCode,
      eventName: EVENT_NAME.TransferCommitted,
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
    })

    await runEngagementCron()

    assert.equal(appNotifications.length, 2)
    assert.equal(pushQueue.add.mock.callCount(), 0)
  })
})
