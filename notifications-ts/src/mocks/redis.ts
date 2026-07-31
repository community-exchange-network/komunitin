// Mock for redis module — provides KV cache mock (get/set).
// The old Redis stream mocking (xReadGroup, xAck, etc.) was removed
// when event processing was migrated to BullMQ (see event-queue.ts).
import { mock } from 'node:test';

export const mockRedis = () => {
  const connectMock = mock.fn();
  const disconnectMock = mock.fn<any>();
  const getMock = mock.fn<any>();
  const pingMock = mock.fn(async () => 'PONG');
  const setMock = mock.fn<any>();

  // Internal state for KV cache
  const kvStore = new Map<string, string>();

  getMock.mock.mockImplementation(async (key: string) => {
    return kvStore.get(key) || null;
  });
  setMock.mock.mockImplementation(async (key: string, value: string) => {
    kvStore.set(key, value);
    return 'OK';
  });

  // Mock the entire redis module
  mock.module('redis', {
    namedExports: {
      createClient: () => ({
        connect: connectMock,
        disconnect: disconnectMock,
        get: getMock,
        ping: pingMock,
        set: setMock,
        quit: disconnectMock,
        on: mock.fn(),
        isOpen: true
      }),
      commandOptions: (opts: any) => opts
    },
  });

  return {
    reset: () => {
      kvStore.clear();
      connectMock.mock.resetCalls();
      disconnectMock.mock.resetCalls();
      getMock.mock.resetCalls();
      pingMock.mock.resetCalls();
      setMock.mock.resetCalls();
    },
    mocks: {
      connectMock,
      disconnectMock,
      getMock,
      pingMock,
      setMock,
    }
  }
}
