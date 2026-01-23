import assert from 'node:assert';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { _app as app } from '../../server';
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

  const createPushNotification = (overrides: any = {}) => {
    return prisma.pushNotification.create({
      data: {
        id: randomUUID(),
        tenantId: 'GRP1',
        userId: 'user-1',
        subscriptionId: 'sub-1',
        eventId: 'evt-1',
        ...overrides,
      },
    });
  };

  const patchTelemetry = (id: string, attributes: any, code: string = 'GRP1') => {
    return request(app)
      .patch(`/${code}/push-notifications/${id}`)
      .send({
        data: {
          type: 'push-notifications',
          id,
          attributes,
        },
      });
  };

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

  describe('Telemetry API', () => {
    it('updates deliveredAt when delivered is true', async () => {
      const pn = await createPushNotification();

      const response = await patchTelemetry(pn.id, { delivered: true });

      assert.strictEqual(response.status, 200);
      assert.ok(response.body.data.attributes.delivered);
      assert.ok(pushNotifications.find((n: any) => n.id === pn.id).deliveredAt instanceof Date);
    });

    it('updates clickedAt and clickedAction', async () => {
      const pn = await createPushNotification();

      const response = await patchTelemetry(pn.id, {
        clicked: true,
        clickaction: 'open_app',
      });

      assert.strictEqual(response.status, 200);
      assert.ok(response.body.data.attributes.clicked);
      assert.strictEqual(response.body.data.attributes.clickaction, 'open_app');
      assert.ok(pushNotifications.find((n: any) => n.id === pn.id).clickedAt instanceof Date);
      assert.strictEqual(pushNotifications.find((n: any) => n.id === pn.id).clickedAction, 'open_app');
    });

    it('returns 400 if ID in body does not match ID in URL', async () => {
      const id1 = randomUUID();
      const id2 = randomUUID();
      const response = await request(app)
        .patch(`/GRP1/push-notifications/${id1}`)
        .send({
          data: {
            type: 'push-notifications',
            id: id2,
            attributes: {
              delivered: true,
            },
          },
        });

      assert.strictEqual(response.status, 400);
    });

    it('returns 404 if notification not found', async () => {
      const nonExistentId = randomUUID();
      const response = await patchTelemetry(nonExistentId, { delivered: true });

      assert.strictEqual(response.status, 404);
    });
  });
});
