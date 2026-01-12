import { Job } from 'bullmq';
import { createQueue, createWorker } from '../utils/queue';
import { eventBus } from './event-bus';
import { EVENT_NAME, TransferEvent, PostEvent, NotificationEvent } from './events';
import { dispatchEvent } from './worker';
import logger from '../utils/logger';
import { KomunitinClient } from '../clients/komunitin/client';
import { Offer, Need } from '../clients/komunitin/types';

const QUEUE_NAME = 'synthetic-events';
const JOB_NAME_STILL_PENDING = 'transfer-still-pending';
const JOB_NAME_CHECK_EXPIRING = 'check-post-expirations';
const JOB_NAME_NOTIFY_EXPIRY = 'notify-post-expiry';

const getStillPendingJobId = (transferId: string) => `still-pending:${transferId}`;

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

type NotifyExpiryData = {
  code: string;
  type: 'offer' | 'need';
  id: string;
};

type SyntheticJobData = StillPendingData | NotifyExpiryData | Record<string, never>;

const dispatchSyntheticEvent = async (event: Pick<NotificationEvent, "name"|"code"|"data"> & {user?: string}) => {
  await dispatchEvent({
    id: `synth-event-${Date.now()}`,
    user: '',
    ...event,
    source: 'notifications-synthetic-events',
    time: new Date(),
  })
}

/**
 * Synthetic event generator.
 * It schedules future events based on current events (e.g. transfer still pending).
 */
export const initSyntheticEvents = () => {
  const queue = createQueue<SyntheticJobData>(QUEUE_NAME);
  const client = new KomunitinClient();

  // Schedule the check expiring job
  queue.add(
    JOB_NAME_CHECK_EXPIRING,
    {},
    {
      repeat: { pattern: '0 */4 * * *' },
      jobId: 'check-post-expirations-cron',
    }
  ).catch(err => {
    logger.error({ err }, 'Failed to schedule check-post-expirations-cron');
  });

  const worker = createWorker<SyntheticJobData>(
    QUEUE_NAME,
    async (job: Job<SyntheticJobData>) => {
      // JOB_NAME_STILL_PENDING
      if (job.name === JOB_NAME_STILL_PENDING) {
        const { code, data, user, iteration } = job.data as StillPendingData;

        logger.info({ transfer: data.transfer, iteration }, 'Processing synthetic still-pending job');

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

        // Remove current job to release the ID
        await job.remove();

        await queue.add(
          JOB_NAME_STILL_PENDING,
          { ...job.data, iteration: nextIteration } as StillPendingData,
          { 
            delay,
            jobId: getStillPendingJobId(data.transfer),
          }
        );
      }
      
      // JOB_NAME_CHECK_EXPIRING
      else if (job.name === JOB_NAME_CHECK_EXPIRING) {
        logger.info('Checking for expiring posts');
        try {
          const groups = await client.getGroups();
          for (const group of groups) {
            const groupCode = group.attributes.code;

            const processItems = async (items: (Offer | Need)[], type: 'offer' | 'need') => {
              for (const item of items) {
                // Check expiration
                if (!item.attributes.expires) continue;
                
                const created = new Date(item.attributes.created).getTime();
                const expires = new Date(item.attributes.expires).getTime();
                const now = Date.now();
                
                const window = expires - created;
                const timeLeft = expires - now;
                
                if (timeLeft <= 0) continue; // Already expired
                
                const DAY = 24 * 60 * 60 * 1000;
                
                // Condition 7 days: window > 30 days && timeLeft <= 7 days
                if (window > 30 * DAY && timeLeft <= 7 * DAY) {
                   const jobId = `expiry-7d-${item.id}`;
                   await queue.add(
                     JOB_NAME_NOTIFY_EXPIRY,
                     { code: groupCode, type, id: item.id } as NotifyExpiryData,
                     {
                       jobId,
                     }
                   );
                }
                
                // Condition 24h: timeLeft <= 24 hours
                if (timeLeft <= DAY) {
                   const jobId = `expiry-24h-${item.id}`;
                    await queue.add(
                     JOB_NAME_NOTIFY_EXPIRY,
                     { code: groupCode, type, id: item.id } as NotifyExpiryData,
                     { jobId }
                   );
                }
              }
            };
            
            // Fetch offers and needs
            const offers = await client.getOffers(groupCode);
            await processItems(offers, 'offer');
            
            const needs = await client.getNeeds(groupCode);
            await processItems(needs, 'need');
          }
        } catch (err) {
            logger.error({ err }, 'Error checking expiring posts');
            throw err;
        }
      }

      // JOB_NAME_NOTIFY_EXPIRY
      else if (job.name === JOB_NAME_NOTIFY_EXPIRY) {
        const { code, type, id } = job.data as NotifyExpiryData;
        await dispatchSyntheticEvent({
          name: EVENT_NAME.PostExpiresSoon,
          code,
          data: {
            [type]: id
          }
        });
      }
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
        jobId
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
