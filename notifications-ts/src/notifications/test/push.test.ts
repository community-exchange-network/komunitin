import assert from 'node:assert';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { createQueue } from '../../mocks/queue';
import { resetWebPushMocks, sendNotification, setVapidDetails } from '../../mocks/web-push';
import { mockDb } from '../../mocks/prisma';
import prisma from '../../utils/prisma';
import { setupServer } from 'msw/node';
import handlers from '../../mocks/handlers';
import { generateKeys } from '../../mocks/auth';
import { mockRedis } from '../../mocks/redis';
import { db, createTransfers } from '../../mocks/db';
import { createEvent } from './utils';

const JOB_NAME_SEND_PUSH = 'send-push-notification';
const server = setupServer(...handlers);
const { put } = mockRedis();
const queue = createQueue('push-notifications');

const { pushSubscription: subscriptions, pushNotification: pushNotifications } = mockDb();

describe('Push notifications', () => {
  let stopWorker: (() => Promise<void>) | (() => void) | undefined;
  let runNotificationsWorker: any;
  let notificationsWorker: { stop: () => Promise<void> } | null = null;

  before(async () => {
    // Prepare auth keys and start MSW to mock accounting/client API
    await generateKeys();
    server.listen({ onUnhandledRequest: 'bypass' });
    const workerModule = await import('../worker');
    runNotificationsWorker = workerModule.runNotificationsWorker;
  });

  after(() => {
    server.close();
  });

  beforeEach(async () => {
    queue.resetMocks();
    resetWebPushMocks();
    // Start notifications worker so the event stream is processed
    notificationsWorker = await runNotificationsWorker();
  });

  afterEach(async () => {
    subscriptions.length = 0;
    pushNotifications.length = 0;

    if (notificationsWorker) {
      await notificationsWorker.stop();
      notificationsWorker = null;
    }

    if (stopWorker) {
      await stopWorker();
    }
  });

  it('sends a web push and stores telemetry', async () => {
    const subscription = await prisma.pushSubscription.create({
      data: {
        tenantId: 'GRP1',
        userId: 'user-1',
        endpoint: 'https://example.com/endpoint',
        p256dh: 'pkey',
        auth: 'auth',
      }
    });

    const message = {
      title: 'Hello',
      body: 'World',
      image: undefined,
      route: '/app/notifications'
    };

    await queue.dispatchToWorker(JOB_NAME_SEND_PUSH, {}, {
      subscription: {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      message,
      code: subscription.tenantId,
      subscriptionId: subscription.id,
      userId: subscription.userId,
      eventId: 'evt-1',
    });

    assert.equal(setVapidDetails.mock.callCount(), 1);
    assert.equal(sendNotification.mock.callCount(), 1);
    assert.equal(pushNotifications.length, 1);
    assert.equal(pushNotifications[0].tenantId, 'GRP1');
    assert.equal(pushNotifications[0].userId, 'user-1');
    assert.equal(pushNotifications[0].subscriptionId, subscription.id);
    assert.ok(pushNotifications[0].sentAt instanceof Date);
  });

  it('deletes subscriptions on permanent push errors', async () => {
    sendNotification.mock.mockImplementation(async () => {
      const err: any = new Error('Gone');
      err.statusCode = 410;
      throw err;
    });

    const subscription = await prisma.pushSubscription.create({
      data: {
        tenantId: 'GRP1',
        userId: 'user-1',
        endpoint: 'https://example.com/endpoint',
        p256dh: 'pkey',
        auth: 'auth',
      }
    });

    await queue.dispatchToWorker(JOB_NAME_SEND_PUSH, {}, {
      subscription: {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      message: {
        title: 'Hello',
        body: 'World',
        image: undefined,
        route: '/app/notifications'
      },
      code: subscription.tenantId,
      subscriptionId: subscription.id,
      userId: subscription.userId,
      eventId: 'evt-2',
    });

    assert.equal(subscriptions.length, 0);
    assert.equal(pushNotifications.length, 1);
    assert.equal(pushNotifications[0].deliveredAt, undefined);
  });

  it('retries on transient push errors', async () => {
    sendNotification.mock.mockImplementation(async () => {
      const err: any = new Error('Boom');
      err.statusCode = 500;
      throw err;
    });

    const subscription = await prisma.pushSubscription.create({
      data: {
        tenantId: 'GRP1',
        userId: 'user-1',
        endpoint: 'https://example.com/endpoint',
        p256dh: 'pkey',
        auth: 'auth',
      }
    });

    await assert.rejects(async () => {
      await queue.dispatchToWorker(JOB_NAME_SEND_PUSH, {}, {
        subscription: {
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
        message: {
          title: 'Hello',
          body: 'World',
          image: undefined,
          route: '/app/notifications'
        },
        code: subscription.tenantId,
        subscriptionId: subscription.id,
        userId: subscription.userId,
        eventId: 'evt-3',
      });
    });

    assert.equal(subscriptions.length, 1);
    assert.equal(pushNotifications.length, 1);
  });

  it('e2e-ish: TransferCommitted -> schedules push job and sends push', async () => {
    // Create data (group and transfers)
    const groupId = 'GRP1';
    createTransfers(groupId);
    const transfer = db.transfers[0];

    const accountUserId = (accountId: string) => {
      const memberId = db.members.find(m => m.relationships.account.data.id === accountId)!.id;
      return db.users.find(u => u.relationships.members.data.some((r: any) => r.id === memberId))!.id;
    }
    const payerUserId = accountUserId(transfer.relationships.payer.data.id);
    const payeeUserId = accountUserId(transfer.relationships.payee.data.id);

    // Create a push subscription for payee (so only one job should be scheduled)
    await prisma.pushSubscription.create({
      data: {
        tenantId: groupId,
        userId: payeeUserId,
        endpoint: 'https://example.com/endpoint',
        p256dh: 'pkey',
        auth: 'auth'
      }
    });

    // Ensure the user's settings allow account notifications
    const settings = db.userSettings.find(s => s.id === `${payeeUserId}-settings`);
    if (settings) {
      settings.attributes.notifications = {
        ...(settings.attributes.notifications || {}),
        myAccount: true,
      };
    }

    // Emit TransferCommitted event
    const eventData = createEvent('TransferCommitted', transfer.id, groupId, payerUserId, 'test-push-e2e-1');
    await put(eventData);

    // Verify a push job was scheduled
    assert.strictEqual(queue.add.mock.callCount(), 1, 'Should schedule send push job');
    const [jobName, jobData, jobOpts] = queue.add.mock.calls[0].arguments;
    assert.strictEqual(jobName, JOB_NAME_SEND_PUSH);
    assert.strictEqual(jobData.eventId, eventData.id);
    assert.strictEqual(jobData.userId, payeeUserId);

    // Dispatch job to simulate worker sending
    await queue.dispatchToWorker(jobName, jobOpts, jobData);

    // Verify push was sent and telemetry stored
    assert.strictEqual(sendNotification.mock.callCount(), 1);
    assert.strictEqual(pushNotifications.length, 1);
    assert.strictEqual(pushNotifications[0].tenantId, groupId);
    assert.strictEqual(pushNotifications[0].userId, payeeUserId);
  });
});
