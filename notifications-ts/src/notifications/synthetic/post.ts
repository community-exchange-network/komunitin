import { Job, Queue } from 'bullmq';
import { EVENT_NAME } from '../events';
import logger from '../../utils/logger';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Offer, Need } from '../../clients/komunitin/types';
import { dispatchSyntheticEvent, queueJob } from './shared';

const JOB_NAME_CHECK_EXPIRING = 'check-post-expirations';
const JOB_NAME_NOTIFY_EXPIRY = 'notify-post-expiry';

export type NotifyExpiryData = {
  code: string;
  type: 'offer' | 'need';
  id: string;
};

export const handleCheckExpiringJob = async (queue: Queue) => {
  logger.info('Checking for expiring posts');
  
  const client = new KomunitinClient();
  
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
            await queueJob(
              queue,
              JOB_NAME_NOTIFY_EXPIRY,
              `expiry-7d-${item.id}`,
              { code: groupCode, type, id: item.id } as NotifyExpiryData
            );
          }

          // Condition 24h: timeLeft <= 24 hours
          if (timeLeft <= DAY) {
            await queueJob(
              queue,
              JOB_NAME_NOTIFY_EXPIRY,
              `expiry-24h-${item.id}`,
              { code: groupCode, type, id: item.id } as NotifyExpiryData
            );
          }
        }
      };

      // Fetch offers and needs
      const expireBeforeDate = new Date();
      expireBeforeDate.setDate(expireBeforeDate.getDate() + 7);

      const offers = await client.getOffers(groupCode, { "filter[expire][lt]": expireBeforeDate.toISOString() });
      await processItems(offers, 'offer');

      const needs = await client.getNeeds(groupCode);
      await processItems(needs, 'need');
    }
  } catch (err) {
    logger.error({ err }, 'Error checking expiring posts');
    throw err;
  }
};

export const handleNotifyExpiryJob = async (job: Job<NotifyExpiryData>) => {
  const { code, type, id } = job.data;
  
  await dispatchSyntheticEvent({
    name: EVENT_NAME.PostExpiresSoon,
    code,
    data: {
      [type]: id
    }
  });
};

export const schedulePostExpirationCheck = async (queue: Queue) => {
  await queue.upsertJobScheduler(
    'check-post-expirations-cron',
    { pattern: '0 */4 * * *' },
    {
      name: JOB_NAME_CHECK_EXPIRING,
    }
  );
};

/**
 * Initialize post synthetic events.
 * Returns job handlers and setup promise.
 */
export const initPostEvents = (queue: Queue) => {
  schedulePostExpirationCheck(queue).catch(err => {
    logger.error({ err }, 'Failed to schedule check-post-expirations-cron');
  });
  
  return {
    handlers: {
      [JOB_NAME_CHECK_EXPIRING]: () => handleCheckExpiringJob(queue),
      [JOB_NAME_NOTIFY_EXPIRY]: (job: Job<NotifyExpiryData>) => handleNotifyExpiryJob(job),
    },
    stop: async () => {}
  };
};
