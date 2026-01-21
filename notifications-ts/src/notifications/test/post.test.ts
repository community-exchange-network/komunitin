import { setupServer } from 'msw/node'
import assert from 'node:assert'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { generateKeys } from '../../mocks/auth'
import { createNeeds, createOffers, db } from '../../mocks/db'
import handlers from '../../mocks/handlers'
import { mockTable } from '../../mocks/prisma'
import { resetQueueMocks } from '../../mocks/queue'
import { mockRedis } from '../../mocks/redis'
import prisma from '../../utils/prisma'
import { createEvent, verifyNotification } from './utils'

const { put } = mockRedis()
const server = setupServer(...handlers)

// Mock prisma
const appNotifications = mockTable(prisma.appNotification, 'test-notification')

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
    resetQueueMocks()
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

  const setupTestOffer = () => {
    const groupId = 'GRP1'
    createOffers(groupId)
    const offer = db.offers[0]
    const memberId = offer.relationships.member.data.id
    const userId = getUserIdForMember(memberId)
    return { groupId, offer, userId }
  }

  const setupTestNeed = () => {
    const groupId = 'GRP1'
    createNeeds(groupId)
    const need = db.needs[0]
    const memberId = need.relationships.member.data.id
    const userId = getUserIdForMember(memberId)
    return { groupId, need, userId }
  }

  it('should process OfferExpired event', async () => {
      const { groupId, offer, userId } = setupTestOffer()
      const eventData = createEvent('OfferExpired', offer.id, groupId, userId, 'test-offer-expired-1', 'offer')
      
      await put(eventData)

      // Wait for async processing? put is usually "fire and forget" but mockRedisStream probably returns when processed if it's in-memory directly, 
      // but usually we rely on the worker loop. In notifications.test.ts the previous tests used 'await put(eventData)' too.
      // The redis mock implementation might be synchronous or close to it.

      assert.equal(appNotifications.length, 1, "Should create 1 notification")
      const notification = appNotifications[0]
      assert.equal(notification.tenantId, groupId)
      assert.equal(notification.userId, userId)
      assert.ok(notification.title)
      
      await verifyNotification(userId, groupId, notification.id, "Offer expired")
  })

  it('should process NeedExpired event', async () => {
      const { groupId, need, userId } = setupTestNeed()
      const eventData = createEvent('NeedExpired', need.id, groupId, userId, 'test-need-expired-1', 'need')

      await put(eventData)

      assert.equal(appNotifications.length, 1, "Should create 1 notification")
      const notification = appNotifications[0]
      assert.equal(notification.tenantId, groupId)
      assert.equal(notification.userId, userId)
      
      await verifyNotification(userId, groupId, notification.id, "Need expired")
  })
})
