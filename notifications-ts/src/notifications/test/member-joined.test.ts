import { setupServer } from 'msw/node'
import assert from 'node:assert'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'
import { generateKeys } from '../../mocks/auth'
import { createMember, getUserIdForMember, resetDb } from '../../mocks/db'
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

describe('MemberJoined notifications', () => {
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

  it('should process MemberJoined event and generate a welcome notification', async () => {
    const groupId = 'GRP1'
    const member = createMember({ groupCode: groupId, name: 'Ada Lovelace' })
    const userId = getUserIdForMember(member.id)

    const eventData = createEvent('MemberJoined', member.id, groupId, userId, 'test-member-joined-1', 'member')

    await put(eventData)

    assert.equal(appNotifications.length, 1, 'Should create 1 notification')
    const notification = appNotifications[0]
    assert.equal(notification.tenantId, groupId)
    assert.equal(notification.userId, userId)

    await verifyNotification(userId, groupId, notification.id, {
      title: 'Welcome to Group GRP1!',
      body: 'Hi Ada Lovelace, your account is now active! Start exploring offers and needs in your community. Happy exchange!',
    })
  })
})
