import { test } from 'node:test';
import { queueJob } from '../utils/queue-job';
import { Queue } from 'bullmq';

// Mock job storage
const mockJobs = new Map<string, any>();

// Export mocked functions so tests can assert against them
export const queueAdd: any = test.mock.fn(async (name: string, data: any, opts?: any) => {
  const jobId = opts?.jobId || `job-${Date.now()}-${Math.random()}`;
  const job = {
    id: jobId,
    name,
    data,
    opts: opts || {},
    remove: async () => {
      mockJobs.delete(jobId);
    }
  };
  mockJobs.set(jobId, job);
  return job;
});

export const queueGetJob: any = test.mock.fn(async (jobId: string) => {
  return mockJobs.get(jobId) || null;
});

export const queueUpsertJobScheduler: any = test.mock.fn(async () => { });

export const queueRemoveJobScheduler: any = test.mock.fn(async () => { });

export const queueClose: any = test.mock.fn(async () => { });

/**
 * Create a Queue-like object that can be passed to synthetic modules.
 * Backed by the same in-memory job store used by queueAdd/queueGetJob.
 */
export const createMockQueue = () => {
  return {
    add: queueAdd,
    getJob: queueGetJob,
    upsertJobScheduler: queueUpsertJobScheduler,
    removeJobScheduler: queueRemoveJobScheduler,
    close: queueClose,
  } as Queue;
};

// Captures the processor function passed to the Worker constructor
export let workerProcessor: any;

const mockExports = {
  createQueue: (name: string) => {
    return {
      add: queueAdd,
      getJob: queueGetJob,
      upsertJobScheduler: queueUpsertJobScheduler,
      removeJobScheduler: queueRemoveJobScheduler,
      close: queueClose
    };
  },
  createWorker: (name: string, processor: any) => {
    workerProcessor = processor;
    return {
      close: async () => { }
    };
  },
  queueJob: queueJob,
};

// Mock utils/queue (relative path)
test.mock.module('../utils/queue', { namedExports: mockExports });

/**
 * Reset all queue mocks
 */
export const resetQueueMocks = () => {
  queueAdd.mock.resetCalls();
  queueGetJob.mock.resetCalls();
  queueUpsertJobScheduler.mock.resetCalls();
  queueRemoveJobScheduler.mock.resetCalls();
  queueClose.mock.resetCalls();
  mockJobs.clear();
};

/**
 * Helper to manually dispatch a job to the worker processor
 */
export const dispatchMockJob = async (jobName: string, jobOpts: { jobId?: string }, jobData: any) => {
  if (!workerProcessor) {
    throw new Error('Worker processor not initialized. Ensure worker is created before dispatching jobs.');
  }
  const mockJob = {
    id: jobOpts.jobId || 'test-job-id',
    name: jobName,
    data: jobData,
    remove: async () => { }
  };

  await workerProcessor(mockJob);
};
