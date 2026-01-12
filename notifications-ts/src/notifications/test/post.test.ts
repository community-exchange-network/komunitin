import { test, describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupServer } from 'msw/node'
import handlers from '../../mocks/handlers'
import { generateKeys } from '../../mocks/auth'
import prisma from '../../utils/prisma'
import { mockRedisStream } from '../../mocks/redis'
import { db, createOffers, createNeeds } from '../../mocks/db'
import { createEvent, verifyNotification } from './utils'

const { put } = mockRedisStream()
const server = setupServer(...handlers)

// Mock prisma
const appNotifications: any[] = []

prisma.appNotification.create = test.mock.fn(async (data: any) => {
  const notification = {
    id: `test-notification-${Math.random().toString(36).substring(2, 15)}`,
    ...data.data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  appNotifications.push(notification)
  return notification
}) as any

prisma.appNotification.findMany = test.mock.fn(async (args: any) => {
  let results = appNotifications
  if (args.where) {
    for (const [key, value] of Object.entries(args.where)) {
      results = results.filter(n => n[key] === value)
    }
  }
  return results
}) as any

describe('Post notifications', () => {
  let runNotificationsWorker: () => Promise<{ stop: () => Promise<void> }>;
  let worker: { stop: () => Promise<void> } | null = null;
  
  before(async () => {
    const workerModule = await import('../worker')
    runNotificationsWorker = workerModule.runNotificationsWorker
    await generateKeys()
    server.listen()
  })

  after(() => {
    server.close()
  })

  beforeEach(async () => {
    appNotifications.length = 0
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
