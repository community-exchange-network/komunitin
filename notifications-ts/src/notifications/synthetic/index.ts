import { Job } from 'bullmq';
import { createQueue, createWorker } from '../../utils/queue';
import logger from '../../utils/logger';
import { QUEUE_NAME } from './shared';
import { initTransferEvents } from './transfer';
import { initPostEvents } from './post';

/**
 * Synthetic event generator.
 * It schedules future events based on current events (e.g. transfer still pending).
 */
export const initSyntheticEvents = () => {
  const queue = createQueue(QUEUE_NAME);

  // Initialize modules
  const transferModule = initTransferEvents(queue);
  const postModule = initPostEvents(queue);

  // Combine all handlers
  const handlers = {
    ...transferModule.handlers,
    ...postModule.handlers,
  };

  // Create worker that delegates to registered handlers
  const worker = createWorker(
    QUEUE_NAME,
    async (job: Job) => {
      const handler = handlers[job.name];
      if (handler) {
        await handler(job);
      } else {
        logger.warn({ jobName: job.name }, 'No handler registered for job');
      }
    }
  );

  return () => {
    transferModule.stop();
    postModule.stop();
    worker.close();
    queue.close();
  };
};
