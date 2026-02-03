import { Job, Queue } from 'bullmq';
import { eventBus } from '../event-bus';
import { EVENT_NAME, TransferEvent } from '../events';
import logger from '../../utils/logger';
import { dispatchSyntheticEvent } from './shared';
import { queueJob } from '../../utils/queue-job';

const JOB_NAME_STILL_PENDING = 'transfer-still-pending';

const getStillPendingJobId = (transferId: string) => `still-pending-${transferId}`;

type StillPendingData = {
  code: string;
  data: {
    transfer: string;
    payer: string;
    payee: string;
  }
  user: string;
  iteration: number;
};

const handleStillPendingJob = async (job: Job<StillPendingData>, queue: Queue) => {
  const { code, data, user, iteration } = job.data;

  logger.debug({ transfer: data.transfer, iteration }, 'Processing synthetic still-pending job');

  // Process the synthetic event through the handler to enrich it and notify channels
  await dispatchSyntheticEvent({
    name: EVENT_NAME.TransferStillPending,
    code,
    data,
    user,
  });

  // Schedule next one
  const nextIteration = iteration + 1;
  let delay = 0;

  // 24h, 48h, 72h, weekly
  if (nextIteration <= 3) {
    delay = 24 * 60 * 60 * 1000;
  } else {
    delay = 7 * 24 * 60 * 60 * 1000;
  }

  await queueJob(
    queue,
    JOB_NAME_STILL_PENDING,
    getStillPendingJobId(data.transfer),
    { ...job.data, iteration: nextIteration },
    { replace: true, delay }
  );
};

const subscribeTransferEvents = (queue: Queue) => {
  const unsubPending = eventBus.on(EVENT_NAME.TransferPending, async (event: TransferEvent) => {
    logger.debug({ transferId: event.data.transfer }, 'Scheduling first still-pending check');

    const jobId = getStillPendingJobId(event.data.transfer);
    await queueJob(
      queue,
      JOB_NAME_STILL_PENDING,
      jobId,
      {
        code: event.code,
        data: {
          transfer: event.data.transfer,
          payer: event.data.payer,
          payee: event.data.payee,
        },
        user: event.user,
        iteration: 1,
      },
      {
        delay: 24 * 60 * 60 * 1000,
        replace: true,
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
  };
};

/**
 * Initialize transfer synthetic events.
 * Returns job handlers and cleanup function.
 */
export const initTransferEvents = (queue: Queue) => {
  const unsubscribe = subscribeTransferEvents(queue);
  
  return {
    handlers: {
      [JOB_NAME_STILL_PENDING]: (job: Job<StillPendingData>) => handleStillPendingJob(job, queue),
    },
    stop: unsubscribe,
  };
};
