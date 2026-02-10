// Mock for redis module
import { mock } from 'node:test';

export const mockRedis = () => {
  const xReadGroupMock = mock.fn<any>();
  const xAckMock = mock.fn<any>();
  const connectMock = mock.fn();
  const disconnectMock = mock.fn<any>();
  const xGroupCreateMock = mock.fn();
  const getMock = mock.fn<any>();
  const setMock = mock.fn<any>();


  // Internal state for queue
  const eventQueue: any[] = [];
  let nextReadResolve: ((events: any[]) => void) | null = null;
  let nextReadReject: ((err: Error) => void) | null = null;
  const ackResolvers = new Map<string, (val: any) => void>();

  // Internal state for KV
  const kvStore = new Map<string, string>();

  // Default implementations
  getMock.mock.mockImplementation(async (key: string) => {
    return kvStore.get(key) || null;
  });
  setMock.mock.mockImplementation(async (key: string, value: string) => {
    kvStore.set(key, value);
    return 'OK';
  });
  // Implementation of xReadGroup that supports blocking and pushing
  xReadGroupMock.mock.mockImplementation(async () => {
    // If we have events, return them immediately
    if (eventQueue.length > 0) {
      const events = [...eventQueue];
      eventQueue.length = 0;
      return [{
        name: 'komunitin_events',
        messages: events
      }];
    }

    // Otherwise block
    return new Promise((resolve, reject) => {
      nextReadResolve = resolve;
      nextReadReject = reject;
    });
  });

  // Implementation of xAck that resolves the promise returned by put()
  xAckMock.mock.mockImplementation(async (key: string, group: string, id: string) => {
    const resolve = ackResolvers.get(id);
    if (resolve) {
      resolve(true);
      ackResolvers.delete(id);
    }
    return 1;
  });

  // Implementation of disconnect to break the blocking read
  disconnectMock.mock.mockImplementation(async () => {
    if (nextReadReject) {
      nextReadReject(new Error('Client disconnected'));
      nextReadResolve = null;
      nextReadReject = null;
    }
  });

  // Mock the entire redis module
  mock.module('redis', {
    namedExports: {
      createClient: () => ({
        connect: connectMock,
        disconnect: disconnectMock,
        get: getMock,
        set: setMock,
        xReadGroup: xReadGroupMock,
        xAck: xAckMock,
        xGroupCreate: xGroupCreateMock,
        quit: disconnectMock,
        on: mock.fn(), // for error handling
        isOpen: true
      }),
      commandOptions: (opts: any) => opts 
    },
  });

  return {
    // Helper to put an event into the stream and wait for it to be processed (acked)
    put: (eventData: any) => {
      return new Promise((resolve) => {
        const id = eventData.id || Date.now().toString() + '-0'
        const message = { id, message: eventData };
        
        ackResolvers.set(id, resolve);
        
        if (nextReadResolve) {
          nextReadResolve([{
            name: 'komunitin_events',
            messages: [message]
          }]);
          nextReadResolve = null;
          nextReadReject = null;
        } else {
          eventQueue.push(message);
        }
      });
    },
    reset: () => {
      eventQueue.length = 0;
      nextReadResolve = null;
      nextReadReject = null;
      ackResolvers.clear();
      kvStore.clear();
    },
    // Expose mocks if needed for assertions
    mocks: {
      connectMock,
      disconnectMock,
      getMock,
      setMock,
      xReadGroupMock,
      xAckMock,
      xGroupCreateMock
    }
  }
}

