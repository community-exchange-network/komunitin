import { setupServer } from 'msw/node'
import assert from 'node:assert'
import { after, afterEach, before, beforeEach } from 'node:test'
import supertest from 'supertest'
import { generateKeys, signJwt } from '../../mocks/auth'
import { resetDb } from '../../mocks/db'
import handlers from '../../mocks/handlers'
import { mockDb } from '../../mocks/prisma'
import { createQueue } from '../../mocks/queue'
import { mockRedis } from '../../mocks/redis'
import { _app } from '../../server'
import prisma from '../../utils/prisma'

export const createEvent = (name: string, payloadId: string, groupId: string, userId: string, eventId: string, dataKey: string = 'transfer') => {
  return {
    name,
    time: new Date().toISOString(),
    data: JSON.stringify({ [dataKey]: payloadId }),
    source: 'mock-accounting',
    code: groupId,
    user: userId,
    id: eventId
  }
}

export const verifyNotification = async (
  userId: string,
  groupId: string,
  notificationId: string,
  expected: string | { title: string; body?: string }
) => {
  const expectedTitle = typeof expected === 'string' ? expected : expected.title;
  const expectedBody = typeof expected === 'string' ? undefined : expected.body;

  const token = await signJwt(userId, ['komunitin_social'])
  const response = await supertest(_app)
    .get(`/${groupId}/notifications`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200)

  assert.equal(response.body.data.length, 1)
  assert.equal(response.body.data[0].id, notificationId)
  assert.equal(response.body.data[0].attributes.title, expectedTitle)

  if (expectedBody !== undefined) {
    assert.equal(response.body.data[0].attributes.body, expectedBody)
  }
}

type SetupNotificationsTestOptions = {
  useWorker?: boolean;
  useAppChannel?: boolean;
  useServer?: boolean;
  useMockRedis?: boolean;
  usePushQueue?: boolean;
  useSyntheticQueue?: boolean;
  useAuthKeys?: boolean;
  resetDb?: boolean;
};

type SetupNotificationsTestReturn = {
  appNotifications: any[];
  put: ReturnType<typeof mockRedis>['put'];
  pushQueue: ReturnType<typeof createQueue> | null;
  syntheticQueue: ReturnType<typeof createQueue> | null;
};

type SetupNotificationsTestReturnWithSyntheticQueue = SetupNotificationsTestReturn & {
  syntheticQueue: ReturnType<typeof createQueue>;
};

type SetupNotificationsTestReturnWithPushQueue = SetupNotificationsTestReturn & {
  pushQueue: ReturnType<typeof createQueue>;
};

export function setupNotificationsTest(
  options?: SetupNotificationsTestOptions & { usePushQueue?: true; useSyntheticQueue?: true }
): SetupNotificationsTestReturnWithPushQueue & SetupNotificationsTestReturnWithSyntheticQueue;
export function setupNotificationsTest(
  options?: SetupNotificationsTestOptions & { useSyntheticQueue?: true }
): SetupNotificationsTestReturnWithSyntheticQueue;
export function setupNotificationsTest(
  options?: SetupNotificationsTestOptions & { usePushQueue?: true }
): SetupNotificationsTestReturnWithPushQueue;

export function setupNotificationsTest(options: SetupNotificationsTestOptions = {}): SetupNotificationsTestReturn  {
  const {
    useWorker = false,
    useAppChannel = false,
    useServer = true,
    useMockRedis = true,
    usePushQueue = false,
    useSyntheticQueue = false,
    useAuthKeys = true,
    resetDb: shouldResetDb = true,
  } = options;

  const server = useServer ? setupServer(...handlers) : null;
  const redis = useMockRedis ? mockRedis() : null;
  const put = redis?.put ?? null;

  const pushQueue = usePushQueue ? createQueue('push-notifications') : null;
  const syntheticQueue = useSyntheticQueue ? createQueue('synthetic-events') : null;

  const { appNotification: appNotifications } = mockDb();

  let runNotificationsWorker: (() => Promise<{ stop: () => Promise<void> }>) | null = null;
  let worker: { stop: () => Promise<void> } | null = null;
  let stopAppChannel: (() => void) | null = null;

  before(async () => {
    if (useWorker) {
      const workerModule = await import('../worker')
      runNotificationsWorker = workerModule.runNotificationsWorker
    }

    if (useAuthKeys) {
      await generateKeys()
    }

    if (server) {
      server.listen({ onUnhandledRequest: 'bypass' })
    }
  })

  after(() => {
    if (server) {
      server.close()
    }
  })

  beforeEach(async () => {
    if (shouldResetDb) {
      resetDb()
    }

    appNotifications.length = 0

    if (pushQueue) {
      pushQueue.resetMocks()
    }

    if (syntheticQueue) {
      syntheticQueue.resetMocks()
    }

    // worker inits all channels
    if (useAppChannel && !useWorker) {
      const { initInAppChannel } = await import('../channels/app')
      stopAppChannel = initInAppChannel()
    }

    if (useWorker && runNotificationsWorker) {
      worker = await runNotificationsWorker()
    }
  })

  afterEach(async () => {
    if (worker) {
      await worker.stop()
      worker = null
    }

    if (stopAppChannel) {
      stopAppChannel()
      stopAppChannel = null
    }
  })

  return {
    put,
    appNotifications,
    pushQueue,
    syntheticQueue,
  };
}

export const subscribeToPushNotifications = (groupCode: string, userId: string) => {
  return prisma.pushSubscription.create({
    data: {
      tenantId: groupCode,
      userId,
      endpoint: 'https://example.com/endpoint',
      p256dh: 'pkey',
      auth: 'auth',
    }
  })
}
