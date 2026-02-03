import { setupServer } from 'msw/node'
import assert from 'node:assert'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { generateKeys } from '../../mocks/auth'
import { createNeeds, createOffers, db } from '../../mocks/db'
import handlers from '../../mocks/handlers'
import { mockDb } from '../../mocks/prisma'
import { createQueue } from '../../mocks/queue'
import { mockRedis } from '../../mocks/redis'
import '../../mocks/web-push'
import { createEvent, verifyNotification } from './utils'

const { put } = mockRedis()
const server = setupServer(...handlers)
const pushQueue = createQueue('push-notifications')
const syntheticQueue = createQueue('synthetic-events')
// Mock prisma
const { appNotification: appNotifications } = mockDb()

describe('Post notifications', () => {
  let runNotificationsWorker: () => Promise<{ stop: () => Promise<void> }>;
  let worker: { stop: () => Promise<void> } | null = null;
  
  before(async () => {
    const workerModule = await import('../worker')
    runNotificationsWorker = workerModule.runNotificationsWorker
    await generateKeys()
    server.listen({ onUnhandledRequest: 'bypass' })
  })

  after(() => {
    server.close()
  })

  beforeEach(async () => {
    appNotifications.length = 0
    pushQueue.resetMocks()
    syntheticQueue.resetMocks()
    worker = await runNotificationsWorker()
  })

  afterEach(async () => {
    if (worker) {
      await worker.stop()
      worker = null
    }
  })

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
        expires: new Date(Date.now() - 1000).toISOString()
      })
      const eventData = createEvent('OfferExpired', offer.id, groupId, userId, 'test-offer-expired-1', 'offer')
      
      await put(eventData)

      assert.equal(appNotifications.length, 1, "Should create 1 notification")
      const notification = appNotifications[0]
      assert.equal(notification.tenantId, groupId)
      assert.equal(notification.userId, userId)
      assert.ok(notification.title)
      
      await verifyNotification(userId, groupId, notification.id, "Offer expired")
  })

  it('should process NeedExpired event', async () => {
      const { groupId, need, userId } = setupTestNeed({
        expires: new Date(Date.now() - 1000).toISOString()
      })
      const eventData = createEvent('NeedExpired', need.id, groupId, userId, 'test-need-expired-1', 'need')

      await put(eventData)

      assert.equal(appNotifications.length, 1, "Should create 1 notification")
      const notification = appNotifications[0]
      assert.equal(notification.tenantId, groupId)
      assert.equal(notification.userId, userId)
      
      await verifyNotification(userId, groupId, notification.id, "Need expired")
  })
})
