import { test, describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import { setupServer } from 'msw/node'
import supertest from 'supertest'
import handlers from '../mocks/handlers'
import { generateKeys, signJwt } from '../mocks/auth'
import prisma from '../utils/prisma'
import { mockRedisStream } from '../mocks/redis'
import { _app } from '../server'
import { db, createTransfers } from '../mocks/db'


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

describe('App notifications', () => {
  let runNotificationsWorker: () => Promise<{ stop: () => Promise<void> }>;
  before(async () => {
    // We need to use a dynamic import for the worker because otherwise the redis mock
    // does not take effect. Specifically, all ESM imports are hoisted (evaluated before 
    // any code), so we cant solve it with static imports.
    const workerModule = await import('./worker')
    runNotificationsWorker = workerModule.runNotificationsWorker
    
    // Generate Auth Keys
    await generateKeys()
    // Start MSW
    server.listen()
  })

  after(() => {
    server.close()
  })

  beforeEach(async () => {
    // Clear DB
    appNotifications.length = 0
  })

  it('should process a TransferCommitted event and generate notifications', async () => {
    const groupId = 'GRP1'
    createTransfers(groupId)
    const transfer = db.transfers[0]

    const accountUserId = (accountId: string) => {
      const memberId = db.members.find(m => m.relationships.account.data.id === accountId)!.id
      const userId = db.users.find(u => {
        return u.relationships.members.data.some((r: any) => r.id === memberId)
      })!.id
      return userId
    }
    const payerUserId = accountUserId(transfer.relationships.payer.data.id)
    const payeeUserId = accountUserId(transfer.relationships.payee.data.id)

    const eventData = {
      name: 'TransferCommitted',
      time: new Date().toISOString(),
      data: JSON.stringify({ 
        transfer: transfer.id
      }),
      source: 'mock-accounting',
      code: groupId,
      user: payerUserId,
      id: "test-event-001"
    }

    // Start the worker
    const { stop } = await runNotificationsWorker()

    // Put event and wait for processing
    await put(eventData)

    // Check DB for the first created notification (is the payer one)
    assert.equal(appNotifications.length, 2, "Should have created 2 notifications")
    const payerNotification = appNotifications[0]
    const payeeNotification = appNotifications[1]
    
    assert.ok(payerNotification, "Notification should be created in DB")
    assert.equal(payerNotification.tenantId, groupId)
    // The title depends on the locale and templates, but let's assume it generated something
    assert.ok(payerNotification.title, "Notification should have a title")

    // Verify payer notification.
    const token = await signJwt(payerUserId, ['komunitin_social'])

    const response = await supertest(_app)
      .get(`/${groupId}/notifications`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.equal(response.body.data.length, 1)
    assert.equal(response.body.data[0].id, payerNotification.id)
    assert.equal(response.body.data[0].attributes.title, "Transfer sent")

    // Verify payee notification.
    const payeeToken = await signJwt(payeeUserId, ['komunitin_social'])

    const payeeResponse = await supertest(_app)
      .get(`/${groupId}/notifications`)
      .set('Authorization', `Bearer ${payeeToken}`)
      .expect(200)

    assert.equal(payeeResponse.body.data.length, 1)
    assert.equal(payeeResponse.body.data[0].id, payeeNotification.id)
    assert.equal(payeeResponse.body.data[0].attributes.title, "Transfer received")

    await stop()
  })
})
