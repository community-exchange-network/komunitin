import { test } from 'node:test';

// Export mocked functions so tests can assert against them
export const queueAdd: any = test.mock.fn();
export const queueGetJob: any = test.mock.fn(async () => null);

// Captures the processor function passed to the Worker constructor
export let workerProcessor: any;

// Mock utils/queue to use the same logic
test.mock.module('../utils/queue', {
  namedExports: {
    createQueue: (name: string) => {
        // Return an object that looks like the BullMQ Queue mock
        // We can just instantiate the mock class defined above if we could access it?
        // But module mocking runs before this code possibly? No, test.mock.module is hoisted? 
        // Actually, explicit mock factories can reference variables in scope if setup correctly, 
        // but normally we define the class inside.
        
        // Let's create a fresh instance of a mock queue structure
        return {
           add: queueAdd,
           getJob: queueGetJob,
           close: async () => {} 
        };
    },
    createWorker: (name: string, processor: any) => {
        workerProcessor = processor;
        return {
           close: async () => {} 
        };
    },
    connection: {},
  }
});

/**
 * Reset all queue mocks
 */
export const resetQueueMocks = () => {
    queueAdd.mock.resetCalls();
    queueGetJob.mock.resetCalls();
    // Reset implementation if needed, but usually resetCalls is enough for call counts
    // implementation of queueGetJob returns null by default which is fine
};

/**
 * Helper to manually dispatch a job to the worker processor
 */
export const dispatchMockJob = async (jobOpts: { jobId?: string }, jobData: any) => {
    if (!workerProcessor) {
        throw new Error('Worker processor not initialized. Ensure worker is created before dispatching jobs.');
    }
    const mockJob = {
      id: jobOpts.jobId || 'test-job-id',
      data: jobData,
      remove: async () => {} 
    };
    
    await workerProcessor(mockJob);
};
