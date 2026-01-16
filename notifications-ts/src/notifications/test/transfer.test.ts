import { test, describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupServer } from 'msw/node'
import handlers from '../../mocks/handlers'
import { generateKeys } from '../../mocks/auth'
import prisma from '../../utils/prisma'
import { mockRedis } from '../../mocks/redis'
import { db, createTransfers } from '../../mocks/db'
import { queueAdd, queueGetJob, resetQueueMocks, dispatchMockJob } from '../../mocks/queue'
import { mockTable } from '../../mocks/prisma'
import { createEvent, verifyNotification } from './utils'

const { put } = mockRedis()
const server = setupServer(...handlers)

// Mock prisma
const appNotifications = mockTable(prisma.appNotification, 'test-notification')

describe('App notifications', () => {
  let runNotificationsWorker: () => Promise<{ stop: () => Promise<void> }>;
  let worker: { stop: () => Promise<void> } | null = null;
  
  before(async () => {
    // We need to use a dynamic import for the worker because otherwise the redis mock
    // does not take effect. Specifically, all ESM imports are hoisted (evaluated before 
    // any code), so we cant solve it with static imports.
    const workerModule = await import('../worker')
    runNotificationsWorker = workerModule.runNotificationsWorker
    
    // Generate Auth Keys
    await generateKeys()
    // Start MSW
    server.listen({ onUnhandledRequest: 'bypass' })
  })

  after(() => {
    server.close()
  })

  beforeEach(async () => {
    // Clear DB
    appNotifications.length = 0
    // Start the worker (channels will register their listeners)
    worker = await runNotificationsWorker()
  })

  afterEach(async () => {
    // Stop the worker
    if (worker) {
      await worker.stop()
      worker = null
    }
  })

  const setupTestTransfer = () => {
    const groupId = 'GRP1'
    createTransfers(groupId)
    const transfer = db.transfers[0]

    const accountUserId = (accountId: string) => {
      const memberId = db.members.find(m => m.relationships.account.data.id === accountId)!.id
      return db.users.find(u => {
        return u.relationships.members.data.some((r: any) => r.id === memberId)
      })!.id
    }
    
    const payerUserId = accountUserId(transfer.relationships.payer.data.id)
    const payeeUserId = accountUserId(transfer.relationships.payee.data.id)
    
    return { groupId, transfer, payerUserId, payeeUserId }
  }

  it('should process a TransferCommitted event and generate notifications', async () => {
    const { groupId, transfer, payerUserId, payeeUserId } = setupTestTransfer()

    const eventData = createEvent('TransferCommitted', transfer.id, groupId, payerUserId, 'test-event-001')

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
    await verifyNotification(payerUserId, groupId, payerNotification.id, "Transfer sent")

    // Verify payee notification.
    await verifyNotification(payeeUserId, groupId, payeeNotification.id, "Transfer received")
  })

  it('should process a TransferPending event and generate notification', async () => {
    const { groupId, transfer, payerUserId, payeeUserId } = setupTestTransfer()
    // Ensure transfer is pending
    transfer.attributes.state = 'pending'

    const eventData = createEvent('TransferPending', transfer.id, groupId, payeeUserId, 'test-event-002')

    // Put event and wait for processing
    await put(eventData)

    // Check DB - should only notify payer (who needs to accept/reject)
    assert.equal(appNotifications.length, 1, "Should have created 1 notification")
    const notification = appNotifications[0]
    
    assert.ok(notification, "Notification should be created in DB")
    assert.equal(notification.tenantId, groupId)
    assert.equal(notification.userId, payerUserId)
    assert.ok(notification.title, "Notification should have a title")

    // Verify payer notification via API
    await verifyNotification(payerUserId, groupId, notification.id, "New transfer request")
  })

  it('should process a TransferRejected event and generate notification', async () => {
    const { groupId, transfer, payerUserId, payeeUserId } = setupTestTransfer()

    const eventData = createEvent('TransferRejected', transfer.id, groupId, payerUserId, 'test-event-003')

    // Put event and wait for processing
    await put(eventData)

    // Check DB - should only notify payee (the one who requested the transfer)
    assert.equal(appNotifications.length, 1, "Should have created 1 notification")
    const notification = appNotifications[0]
    
    assert.ok(notification, "Notification should be created in DB")
    assert.equal(notification.tenantId, groupId)
    assert.equal(notification.userId, payeeUserId)
    assert.ok(notification.title, "Notification should have a title")

    // Verify payee notification via API
    await verifyNotification(payeeUserId, groupId, notification.id, "Transfer rejected")
  })

  it('should process TransferStillPending notification flow', async () => {
    const { groupId, transfer, payerUserId, payeeUserId } = setupTestTransfer()
    // Ensure transfer is pending
    transfer.attributes.state = 'pending'
    
    // Reset queue mock calls
    resetQueueMocks()

    const eventData = createEvent('TransferPending', transfer.id, groupId, payeeUserId, 'test-event-pending-1')

    // 1. Emit Pending Event
    await put(eventData)

    // 2. Verify Job Added (24h)
    assert.strictEqual(queueAdd.mock.callCount(), 1, "Should schedule first job")
    const [jobName, jobData, jobOpts] = queueAdd.mock.calls[0].arguments
    assert.strictEqual(jobName, 'transfer-still-pending')
    assert.strictEqual(jobOpts.delay, 24 * 60 * 60 * 1000)
    assert.strictEqual(jobData.iteration, 1)

    // 3. Dispatch Job (Simulate Worker) passing 24h
    // Notification goes to payer (who needs to perform action)
    
    // Clear notifications before synthetic event to ensure we catch new one
    appNotifications.length = 0;
    
    await dispatchMockJob(jobName, jobOpts, jobData)

    // 4. Assert Notification (Iteration 1)
    assert.equal(appNotifications.length, 1, "Should create notification for still pending")
    const notif1 = appNotifications[0]
    assert.equal(notif1.userId, payerUserId)
    
    await verifyNotification(payerUserId, groupId, notif1.id, "Transfer still pending")

    // 5. Verify Next Job Scheduled
    assert.strictEqual(queueAdd.mock.callCount(), 2, "Should schedule next job")
    const [jobName2, jobData2, jobOpts2] = queueAdd.mock.calls[1].arguments
    assert.strictEqual(jobData2.iteration, 2)
    assert.strictEqual(jobOpts2.delay, 24 * 60 * 60 * 1000)

    // 6. Dispatch Job (Iteration 2)
    appNotifications.length = 0; 
    await dispatchMockJob(jobName2, jobOpts2, jobData2)

    // 7. Assert Notification (Iteration 2)
    assert.equal(appNotifications.length, 1, "Should create 2nd notification")
    await verifyNotification(payerUserId, groupId, appNotifications[0].id, "Transfer still pending")
  })

  it('should cancel the still-pending job when TransferCommitted/Rejected is received', async () => {
    const { groupId, transfer, payerUserId, payeeUserId } = setupTestTransfer()
    // Ensure transfer is pending initially
    transfer.attributes.state = 'pending'
    
    // Reset queue mock calls
    resetQueueMocks()

    const eventPending = createEvent('TransferPending', transfer.id, groupId, payeeUserId, 'test-event-pending-2')

    // 1. Emit Pending Event -> Should schedule job
    await put(eventPending)

    assert.strictEqual(queueAdd.mock.callCount(), 1, "Should schedule job")
    const [jobName, jobData, jobOpts] = queueAdd.mock.calls[0].arguments
    
    // Reset call counts for queueGetJob to isolate the next assertion
    queueGetJob.mock.resetCalls();

    // 2. Setup mock job that will be retrieved for cancellation
    const removeSpy = test.mock.fn(async () => {})
    const mockJob = {
      id: jobOpts.jobId,
      data: jobData,
      remove: removeSpy
    }

    // When synthetic-events calls queue.getJob(id), return our mock job
    queueGetJob.mock.mockImplementation(async (id: string) => {
        if (id === jobOpts.jobId) return mockJob
        return null
    })

    // 3. Emit Committed Event -> Should cancel job
    // Update transfer state to committed conceptually (though the handler for cancelled doesn't check state, 
    // it just cancels the job)
    
    const eventCommitted = createEvent('TransferCommitted', transfer.id, groupId, payerUserId, 'test-event-committed-1')
    await put(eventCommitted)

    // 4. Verify getJob called with correct ID
    assert.strictEqual(queueGetJob.mock.callCount(), 1, "Should try to find existing job")
    assert.strictEqual(queueGetJob.mock.calls[0].arguments[0], jobOpts.jobId)

    // 5. Verify remove was called
    assert.strictEqual(removeSpy.mock.callCount(), 1, "Should remove (cancel) the job")
  })
})
