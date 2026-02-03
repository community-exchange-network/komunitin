import { test } from 'node:test';

const queues = new Map<string, MockQueue>();
export class MockQueue {
  constructor (readonly name: string) {}
  jobs: Map<string, any> = new Map();
  worker: any = null;

  add: any = test.mock.fn(async (name: string, data: any, opts?: any) => {
    const jobId = opts?.jobId || `job-${Date.now()}-${Math.random()}`;
    const job = {
      id: jobId,
      name,
      data,
      opts: opts || {},
      remove: async () => {
        this.jobs.delete(jobId);
      }
    };
    this.jobs.set(jobId, job);
    return job;
  });

  getJob = test.mock.fn(async (jobId: string) => {
    return this.jobs.get(jobId) || null;
  });

  upsertJobScheduler: any = test.mock.fn(async () => { })
  removeJobScheduler: any = test.mock.fn(async () => { })
  close = test.mock.fn(async () => { })

  resetMocks() {
    this.add.mock.resetCalls();
    this.getJob.mock.resetCalls();
    this.upsertJobScheduler.mock.resetCalls();
    this.removeJobScheduler.mock.resetCalls();
    this.close.mock.resetCalls();
    this.jobs.clear();
  }
  /**
   * Helper to manually dispatch a job to the worker processor
   */
  dispatchToWorker = async (jobName: string, jobOpts: { jobId?: string }, jobData: any) => {
    if (!this.worker) {
      throw new Error('Worker processor not initialized. Ensure worker is created before dispatching jobs.');
    }
    const mockJob = {
      id: jobOpts.jobId || 'test-job-id',
      name: jobName,
      data: jobData,
      remove: async () => { }
    };

    await this.worker(mockJob);
  };
}

/**
 * Create a Queue-like object that can be passed to synthetic modules.
 * Backed by the same in-memory job store used by queueAdd/queueGetJob.
 */
export const createQueue = (name: string) => {
  if (!queues.has(name)) {
    queues.set(name, new MockQueue(name));
  }
  return queues.get(name)!;
}

export const createWorker = (name: string, worker: any) => {
  const queue = createQueue(name);
  queue.worker = worker;
  return {
    close: async () => {}
  }
}

const mockExports = {
  createQueue,
  createWorker,
};

// Mock utils/queue (relative path)
test.mock.module('../utils/queue', { namedExports: mockExports });


