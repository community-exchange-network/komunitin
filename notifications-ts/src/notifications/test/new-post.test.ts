import { test, describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupServer } from 'msw/node'
import handlers from '../../mocks/handlers'
import { generateKeys } from '../../mocks/auth'
import prisma from '../../utils/prisma'
import { mockRedisStream } from '../../mocks/redis'
import { db, createOffer, createNeed, createMembers, resetDb, getUserIdForMember } from '../../mocks/db'
import { resetQueueMocks } from '../../mocks/queue'
import { mockTable } from '../../mocks/prisma'
import { createEvent } from './utils'

const { put } = mockRedisStream()
const server = setupServer(...handlers)

// Mock prisma
const appNotifications = mockTable(prisma.appNotification, 'test-notification')

describe('New post notifications (URGENT)', () => {
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
    resetDb()
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

  it('should process urgent OfferPublished event and notify all group users', async () => {
      const groupCode = 'GRP1'
      createMembers(groupCode) // creates 5 members/users
      const members = db.members.filter(m => m.relationships.group.data.id === `group-${groupCode}`)
      const authorMember = members[0]
      const authorUserId = getUserIdForMember(authorMember.id)
      
      const created = new Date()
      const expires = new Date()
      expires.setDate(created.getDate() + 5) // 5 days window <= 7 days

      const offer = createOffer({
        id: 'offer-urgent',
        code: 'OFF1',
        groupCode,
        memberId: authorMember.id,
        attributes: {
          name: 'Urgent Offer',
          content: 'Urgent content',
          created: created.toISOString(),
          expires: expires.toISOString(),
        }
      })

      const eventData = createEvent('OfferPublished', offer.id, groupCode, authorUserId, 'test-offer-published-1', 'offer')
      
      await put(eventData)

      // Wait a bit for async processing (the delay in handler might make it race-y with the check if we don't wait)
      // The worker handles it. In other tests they don't seem to wait much but since I added 50ms delay * 5 members = 250ms+
      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.equal(appNotifications.length, 5, "Should create notifications for all 5 users in the group")
      
      const notification = appNotifications.find(n => n.userId === authorUserId)
      assert.ok(notification, "Author should also receive notification")
      
      const expectedTitle = `New Offer from ${authorMember.attributes.name}`
      assert.equal(notification.title, expectedTitle)
      assert.equal(notification.body, 'Urgent Offer · Urgent content')
  })

  it('should NOT process non-urgent OfferPublished event', async () => {
      const groupCode = 'GRP1'
      createMembers(groupCode)
      const authorMember = db.members[0]
      const authorUserId = getUserIdForMember(authorMember.id)
      
      const created = new Date()
      const expires = new Date()
      expires.setDate(created.getDate() + 10) // 10 days window > 7 days

      const offer = createOffer({
        id: 'offer-non-urgent',
        code: 'OFF2',
        groupCode,
        memberId: authorMember.id,
        attributes: {
          name: 'Lazy Offer',
          content: 'I will do this next month',
          created: created.toISOString(),
          expires: expires.toISOString(),
        }
      })

      const eventData = createEvent('OfferPublished', offer.id, groupCode, authorUserId, 'test-offer-published-2', 'offer')
      
      await put(eventData)
      await new Promise(resolve => setTimeout(resolve, 500))

      assert.equal(appNotifications.length, 0, "Should NOT create notifications for non-urgent post")
  })

  it('should process urgent NeedPublished event', async () => {
      const groupCode = 'GRP1'
      createMembers(groupCode)
      const authorMember = db.members[0]
      const authorUserId = getUserIdForMember(authorMember.id)
      
      const created = new Date()
      const expires = new Date()
      expires.setDate(created.getDate() + 3) // 3 days window <= 7 days

      const need = createNeed({
        id: 'need-urgent',
        code: 'NEE1',
        groupCode,
        memberId: authorMember.id,
        attributes: {
          content: 'I need some help urgently!',
          created: created.toISOString(),
          expires: expires.toISOString(),
        }
      })

      const eventData = createEvent('NeedPublished', need.id, groupCode, authorUserId, 'test-need-published-1', 'need')
      
      await put(eventData)
      await new Promise(resolve => setTimeout(resolve, 1000))

      assert.equal(appNotifications.length, 5)
      const notification = appNotifications[0]
      assert.equal(notification.title, `New Need from ${authorMember.attributes.name}`)
      assert.equal(notification.body, 'I need some help urgently!')
  })
})
