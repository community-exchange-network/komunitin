import assert from 'node:assert';
import { afterEach, beforeEach, describe, it, test } from 'node:test';
import { queueAdd, queueGetJob, resetQueueMocks, workerProcessor } from '../../mocks/queue';

// Mock worker dispatchEvent to avoid side effects (network calls)
const dispatchEvent = test.mock.fn(async () => {});
test.mock.module('../worker', {
  namedExports: {
    dispatchEvent,
  }
});

// Mock Job class/object helper (local to test)
const createMockJob = (data: any, id: string) => ({
  id,
  name: '',
  data,
  remove: async () => {}, // basic mock
});

// Import system under test
// We need dynamic imports if we want to reset between tests, but usually safe to import once if we reset mocks
// Note: importing mocks/queue handles module mocking before this import runs if it's top level?
// Actually 'mocks/queue' calls test.mock.module.
// We must ensure 'mocks/queue' is imported BEFORE 'synthetic-events'.
// In ESM, imports are hoisted. But side effects?
// 'mocks/queue' has side effects (test.mock.module).
// So it should apply.

const { initSyntheticEvents } = await import('../synthetic');
const { eventBus } = await import('../event-bus');
const { EVENT_NAME } = await import('../events');

describe('Synthetic Events', () => {
  let stopService: () => void;
  // ...
  
  beforeEach(() => {
    resetQueueMocks();
    // Default implementations
    queueAdd.mock.mockImplementation(async () => {});
    queueGetJob.mock.mockImplementation(async () => null);
    
    // Start service
    stopService = initSyntheticEvents();
  });

  afterEach(() => {
    if (stopService) stopService();
  });

  it('should schedule the first checking job when TransferPending is received', async () => {
    const transferId = 'tr_123';
    const tenantId = 'T1';
    
    // reset mock because .add might be called with undefined during init? No.
    
    const event = {
      id: 'evt_1',
      name: EVENT_NAME.TransferPending,
      code: tenantId,
      user: 'u_1',
      data: {
        transfer: transferId,
        payer: 'acc_payer',
        payee: 'acc_payee',
      },
      time: new Date(),
      source: 'test'
    };

    // 1. Emit Pending Event
    await eventBus.emit(event as any);

    // 2. Verify queue.add called
    // We expect verification to check if no existing job exists first (getJob)
    assert.strictEqual(queueGetJob.mock.callCount(), 1); 
    assert.strictEqual(queueAdd.mock.callCount(), 1);

    const call = queueAdd.mock.calls[0];
    const [name, data, opts] = call.arguments;

    assert.strictEqual(name, 'transfer-still-pending');
    assert.strictEqual(opts.jobId, `still-pending:${transferId}`);
    assert.strictEqual(opts.delay, 24 * 60 * 60 * 1000); // 24h
    assert.strictEqual(data.iteration, 1);
    assert.strictEqual(data.user, 'u_1');
  });

  it('should emit TransferStillPending and schedule next job when worker processes the job', async () => {
    const transferId = 'tr_123';
    const tenantId = 'T1';
    
    // Setup listener not needed anymore as we spy on dispatchEvent

    // Simulate job data as if it was retrieved from queue
    const jobData = {
      code: tenantId,
      data: {
        transfer: transferId,
        payer: 'acc_payer',
        payee: 'acc_payee',
      },
      user: 'u_1',
      iteration: 1
    };
    
    // Reset dispatch spy
    dispatchEvent.mock.resetCalls();

    const mockJob = createMockJob(jobData, 'job_1');
    mockJob.name = 'transfer-still-pending';
    
    // Manually invoke the worker processor
    assert.ok(workerProcessor, 'Worker processor should be registered');
    await workerProcessor(mockJob);

    // 1. Verify Event Dispatched (instead of emitted via bus)
    assert.strictEqual(dispatchEvent.mock.callCount(), 1, 'Should dispatch event');
    const dispatchArgs = dispatchEvent.mock.calls[0]?.arguments as any;
    assert.ok(dispatchArgs && dispatchArgs.length > 0, 'Dispatch should have been called with arguments');
    const dispatchedEvent = dispatchArgs[0];
    
    assert.ok(dispatchedEvent, 'Dispatched event should exist');
    assert.strictEqual(dispatchedEvent.name, EVENT_NAME.TransferStillPending);
    assert.strictEqual(dispatchedEvent.data.transfer, transferId);
    assert.strictEqual(dispatchedEvent.user, 'u_1');

    // 2. Verify next job scheduled
    assert.strictEqual(queueAdd.mock.callCount(), 1, 'Should add next iteration');
    const [name, data, opts] = queueAdd.mock.calls[0].arguments;
    
    assert.strictEqual(data.iteration, 2);
    // Delay for 2nd iteration is still 24h (total 48h from start)
    assert.strictEqual(opts.delay, 24 * 60 * 60 * 1000);
    assert.strictEqual(opts.jobId, `still-pending:${transferId}`);
  });

  it('should cancel the checking job when TransferCommitted is received', async () => {
    const transferId = 'tr_123';
    
    const mockJob = createMockJob({}, 'job_xxx');
    // Set implementation for this test
    const removeSpy = test.mock.fn(async () => {});
    mockJob.remove = removeSpy;
    
    queueGetJob.mock.mockImplementation(async (id: string) => {
      if (id === `still-pending:${transferId}`) return mockJob;
      return null;
    });

    const event = {
      id: 'evt_2',
      name: EVENT_NAME.TransferCommitted,
      data: { transfer: transferId }
    };

    await eventBus.emit(event as any);

    assert.strictEqual(queueGetJob.mock.callCount(), 1);
    assert.strictEqual(removeSpy.mock.callCount(), 1);
  });

  it('should increase delay to weekly after 3rd iteration', async () => {
      const transferId = 'tr_123';
      const mockJob = createMockJob({
        tenantId: 'T1',
        transferId,
        iteration: 3 // Current is 3, next will be 4
      }, 'job_1');

      await workerProcessor(mockJob);

      const [name, data, opts] = queueAdd.mock.calls[0].arguments;
      assert.strictEqual(data.iteration, 4);
      assert.strictEqual(opts.delay, 7 * 24 * 60 * 60 * 1000); // 7 days
  });
});
