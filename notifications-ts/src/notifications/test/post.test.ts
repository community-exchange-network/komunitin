import assert from 'node:assert'
import { describe, it } from 'node:test'
import { createNeeds, createOffers, db } from '../../mocks/db'
import '../../mocks/web-push'
import { createEvent, setupNotificationsTest, verifyNotification } from './utils'

const { put, appNotifications } = setupNotificationsTest({
  useWorker: true,
  usePushQueue: true,
  useSyntheticQueue: true,
})

describe('Post notifications', () => {
  const getUserIdForMember = (memberId: string) => {
    return db.users.find(u => {
      return u.relationships.members.data.some((r: any) => r.id === memberId)
    })!.id
  }

  const setupTestOffer = (atts: Record<string, any>) => {
    const groupId = 'GRP1'
    createOffers(groupId)
    const offer = db.offers[0]
    offer.attributes = { ...offer.attributes, ...atts }
    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)
    return { groupId, offer, userId }
  }

  const setupTestNeed = (atts: Record<string, any>) => {
    const groupId = 'GRP1'
    createNeeds(groupId)
    const need = db.needs[0]
    need.attributes = { ...need.attributes, ...atts }
    const memberId = need.relationships.member.data.id
    const userId = getUserIdForMember(memberId)
    return { groupId, need, userId }
  }

  it('should process OfferExpired event', async () => {
    const { groupId, offer, userId } = setupTestOffer({
      created: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
      expires: new Date(Date.now() - 1000).toISOString()
    })
    const eventData = createEvent('OfferExpired', offer.id, groupId, userId, 'test-offer-expired-1', 'offer')

    await put(eventData)

    assert.equal(appNotifications.length, 1, "Should create 1 notification")
    const notification = appNotifications[0]
    assert.equal(notification.tenantId, groupId)
    assert.equal(notification.userId, userId)
    assert.ok(notification.title)

    const actions = notification.data?.actions
    assert.ok(actions, 'Expected notification actions')
    assert.equal(actions.length >= 2, true)
    assert.equal(actions[0].title, 'View')
    assert.equal(actions[1].title, 'Extend 1 yr')

    await verifyNotification(userId, groupId, notification.id, "Offer expired")
  })

  it('should process NeedExpired event', async () => {
    const { groupId, need, userId } = setupTestNeed({
      created: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      expires: new Date(Date.now() - 1000).toISOString()
    })
    const eventData = createEvent('NeedExpired', need.id, groupId, userId, 'test-need-expired-1', 'need')

    await put(eventData)

    assert.equal(appNotifications.length, 1, "Should create 1 notification")
    const notification = appNotifications[0]
    assert.equal(notification.tenantId, groupId)
    assert.equal(notification.userId, userId)

    const actions = notification.data?.actions
    assert.ok(actions, 'Expected notification actions')
    assert.equal(actions.length >= 2, true)
    assert.equal(actions[0].title, 'View')

    assert.equal(actions[1].title, 'Extend 7 days')

    await verifyNotification(userId, groupId, notification.id, "Need expired")
  })
})
