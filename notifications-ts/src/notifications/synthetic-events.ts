import { Job } from 'bullmq';
import { createQueue, createWorker } from '../utils/queue';
import { eventBus } from './event-bus';
import { EVENT_NAME, TransferEvent } from './events';
import { dispatchEvent } from './worker';
import logger from '../utils/logger';

const QUEUE_NAME = 'synthetic-events';
const JOB_NAME_STILL_PENDING = 'transfer-still-pending';

const getStillPendingJobId = (transferId: string) => `still-pending:${transferId}`;

type StillPendingData = {
  tenantId: string;
  transferId: string;
  payer: string;
  payee: string;
  userId: string;
  iteration: number;
};

/**
 * Synthetic event generator.
 * It schedules future events based on current events (e.g. transfer still pending).
 */
export const initSyntheticEvents = () => {
  const queue = createQueue<StillPendingData>(QUEUE_NAME);

  const worker = createWorker<StillPendingData>(
    QUEUE_NAME,
    async (job: Job<StillPendingData>) => {
      const { tenantId, transferId, payer, payee, userId, iteration } = job.data;

      logger.info({ transferId, iteration }, 'Processing synthetic still-pending job');

      // Process the synthetic event through the handler to enrich it and notify channels
      await dispatchEvent({
        id: `synth-${job.id}-${Date.now()}`,
        name: EVENT_NAME.TransferStillPending,
        source: 'notifications-synthetic-events',
        code: tenantId,
        time: new Date(),
        user: userId,
        data: {
          transfer: transferId,
          payer,
          payee,
        },
      } as TransferEvent);

      // Schedule next one
      const nextIteration = iteration + 1;
      let delay = 0;

      // 24h, 48h, 72h, weekly
      // iteration 1 runs at 24h => next is 48h (+24h)
      // iteration 2 runs at 48h => next is 72h (+24h)
      // iteration 3 runs at 72h => next is 1 week (+7d)
      if (nextIteration <= 3) {
        delay = 24 * 60 * 60 * 1000;
      } else {
        delay = 7 * 24 * 60 * 60 * 1000;
      }

      // Remove current job to release the ID
      await job.remove();

      await queue.add(
        JOB_NAME_STILL_PENDING,
        { ...job.data, iteration: nextIteration },
        { 
          delay,
          jobId: getStillPendingJobId(transferId),
          removeOnComplete: true,
        }
      );
    }
  );

  // Subscribe to trigger events
  const unsubPending = eventBus.on(EVENT_NAME.TransferPending, async (event: TransferEvent) => {
    logger.debug({ transferId: event.data.transfer }, 'Scheduling first still-pending check');
    
    // Ensure no previous job exists for this transfer, since otherwise the
    // job addition would fail.
    const jobId = getStillPendingJobId(event.data.transfer);
    const existingJob = await queue.getJob(jobId);
    if (existingJob) {
      await existingJob.remove();
    }

    await queue.add(
      JOB_NAME_STILL_PENDING,
      {
        tenantId: event.code,
        transferId: event.data.transfer,
        payer: event.data.payer,
        payee: event.data.payee,
        userId: event.user,
        iteration: 1,
      },
      {
        delay: 24 * 60 * 60 * 1000,
        jobId,
        removeOnComplete: true,
      }
    );
  });

  const cancelJob = async (event: TransferEvent) => {
    const jobId = getStillPendingJobId(event.data.transfer);
    const job = await queue.getJob(jobId);
    if (job) {
      logger.debug({ jobId }, 'Cancelling synthetic job');
      await job.remove();
    }
  };

  const unsubCommitted = eventBus.on(EVENT_NAME.TransferCommitted, cancelJob);
  const unsubRejected = eventBus.on(EVENT_NAME.TransferRejected, cancelJob);

  return () => {
    unsubPending();
    unsubCommitted();
    unsubRejected();
    worker.close();
    queue.close();
  };
};
