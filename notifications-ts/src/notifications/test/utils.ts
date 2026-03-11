import { setupServer } from 'msw/node'
import assert from 'node:assert'
import { after, afterEach, before, beforeEach } from 'node:test'
import supertest from 'supertest'
import { generateKeys, signJwt } from '../../mocks/auth'
import { resetDb } from '../../mocks/db'
import handlers, { externalHandlers } from '../../mocks/handlers'
import { mockDb } from '../../mocks/prisma'
import { createQueue } from '../../mocks/queue'
import { mockRedis } from '../../mocks/redis'
import { mockEmail } from '../../mocks/email'
import prisma from '../../utils/prisma'
import type { EventName, NotificationEvent } from '../events'
import { randomUUID } from 'node:crypto'

// Lazy-load the Express app to ensure mocks (especially utils/queue) are
// registered before the server module graph (which includes event-queue → BullMQ)
// is evaluated. Returns a supertest agent for the app.
export const getApp = async () => supertest((await import('../../server'))._app)

export const createNotification = async (
  tenantId: string,
  userId: string,
  eventId: string,
  title: string,
  body: string = '',
  readAt?: Date
) => {
  return prisma.appNotification.create({
    data: {
      tenantId,
      userId,
      eventId,
      eventName: eventId,
      title,
      body,
      readAt,
    }
  })
}

/**
 * Create event data in the format expected by addEvent / the events queue.
 */
export const createEvent = (name: EventName, params: { code: string; user: string; data: Record<string, string> }): NotificationEvent => {
  return {
    id: randomUUID(),
    name,
    time: new Date(),
    data: params.data,
    source: 'mock-accounting',
    code: params.code,
    user: params.user,
  }
}

/**
 * Create a JSON:API event body for the POST /events endpoint.
 */
export const createEventBody = (name: EventName, params: { code: string; user: string; data: Record<string, string> }) => {
  return {
    data: {
      type: 'events',
      attributes: {
        name,
        source: 'mock-accounting',
        code: params.code,
        time: new Date().toISOString(),
        data: params.data,
      },
      relationships: {
        user: {
          data: { type: 'users', id: params.user },
        },
      },
    },
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
  const app = await getApp()
  const response = await app
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

type SetupNotificationsTestReturnBase = {
  /** Supertest agent for the Express app. Available after before() hook runs. */
  app: supertest.Agent;
  email: ReturnType<typeof mockEmail>;
  appNotifications: any[];
  /** Add an event to the queue and wait for it to be processed (when useWorker is true). */
  put: (event: NotificationEvent) => Promise<any>;
  eventsQueue: ReturnType<typeof createQueue>;
  pushQueue: ReturnType<typeof createQueue> | null;
  syntheticQueue: ReturnType<typeof createQueue> | null;
  server: ReturnType<typeof setupServer> | null;
};

type SetupNotificationsTestReturn<T extends SetupNotificationsTestOptions> =
  SetupNotificationsTestReturnBase &
  (T['usePushQueue'] extends true ? { pushQueue: NonNullable<SetupNotificationsTestReturnBase['pushQueue']> } : {}) &
  (T['useSyntheticQueue'] extends true ? { syntheticQueue: NonNullable<SetupNotificationsTestReturnBase['syntheticQueue']> } : {});

export function setupNotificationsTest<T extends SetupNotificationsTestOptions = {}>(
  options: T = {} as T
): SetupNotificationsTestReturn<T> {
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

  const server = useServer ? setupServer(...handlers, ...externalHandlers) : null;
  const redisMock = useMockRedis ? mockRedis() : null;

  const eventsQueue = createQueue('events');

  const pushQueue = usePushQueue ? createQueue('push-notifications') : null;
  const syntheticQueue = useSyntheticQueue ? createQueue('synthetic-events') : null;

  const { appNotification: appNotifications } = mockDb();
  const email = mockEmail();

  // addEvent and app are lazy-loaded in before() to ensure mocks are set up first.
  let addEventFn: ((event: NotificationEvent) => Promise<any>) | null = null;

  // Use a Proxy so that destructured `app` delegates to the real supertest agent
  // once it's loaded in the before() hook. Without this, `const { app } = setup`
  // would capture the initial `null` and never update.
  let _app: supertest.Agent | null = null;
  const appProxy = new Proxy({} as supertest.Agent, {
    get(_, prop) {
      if (!_app) throw new Error('app accessed before before() hook ran');
      return (_app as any)[prop];
    },
  });

  const result = {
    app: appProxy,
    email,
    put: async (event: NotificationEvent) => {
      if (!addEventFn) {
        throw new Error('put() called before before() hook ran');
      }
      return addEventFn(event);
    },
    eventsQueue,
    appNotifications,
    pushQueue,
    syntheticQueue,
    server,
  };

  let runNotificationsWorker: (() => Promise<{ stop: () => Promise<void> }>) | null = null;
  let worker: { stop: () => Promise<void> } | null = null;
  let stopAppChannel: (() => void) | null = null;

  before(async () => {
    // Lazy-load event-queue and server after mocks are registered.
    const eventQueueModule = await import('../../events/event-queue');
    addEventFn = eventQueueModule.addEvent;
    
    _app = await getApp();

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

    email.reset()

    if (redisMock) {
      redisMock.reset()
    }

    appNotifications.length = 0

    eventsQueue.resetMocks()

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

  return result as SetupNotificationsTestReturn<T>;
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
