import { Job, Queue } from 'bullmq';
import { EVENT_NAME } from '../events';
import logger from '../../utils/logger';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Offer, Need } from '../../clients/komunitin/types';
import { dispatchSyntheticEvent, queueJob } from './shared';

/**
 * Post synthetic events
 *
 * This module handles synthetic events related to posts (offers and needs),
 * specifically for expiration notifications.
 *
 * It periodically checks for posts that are expired or expiring before 7 days.
 * For posts expiring soon, it schedules notifications at 7 days and 24 hours before expiration.
 * For already expired posts, it aggregates them by member and schedules notifications at
 * increasing intervals: 7 days, 30 days, then every 90 days after the lastest expiration.
 */

const JOB_NAME_CHECK_EXPIRING = 'check-post-expirations';
const JOB_NAME_NOTIFY_EXPIRY = 'notify-post-expiry';
const JOB_NAME_NOTIFY_EXPIRED = 'notify-expired-posts';

export type NotifyExpiryData = {
  code: string;
  type: 'offer' | 'need';
  id: string;
  memberId: string;
};

type MemberExpiryInfo = {
  type: 'offer' | 'need';
  id: string;
  expires: Date;
};

const getExpiredJobId = (memberId: string) => `expired-posts:${memberId}`;

const processMemberExpiries = async (queue: Queue, groupCode: string, memberExpiries: Map<string, MemberExpiryInfo>) => {
  for (const [memberId, info] of memberExpiries) {

    const now = Date.now();
    const expiryTime = info.expires.getTime();
    const DAY = 24 * 60 * 60 * 1000;

    const timeSinceExpiry = now - expiryTime;

    let delay = 0;

    if (timeSinceExpiry < 7 * DAY) {
      // Schedule 7-day reminder
      delay = Math.max(0, (7 * DAY) - timeSinceExpiry);
    } else if (timeSinceExpiry < 30 * DAY) {
      // Schedule 30-day reminder
      delay = Math.max(0, (30 * DAY) - timeSinceExpiry);
    } else {
      // Schedule next 90-day boundary (30, 120, 210, 300... days)
      const k = Math.ceil((timeSinceExpiry / DAY - 30) / 90);
      const nextBoundary = (30 + 90 * k) * DAY;
      delay = nextBoundary - timeSinceExpiry;
    }

    // Only schedule if delay is reasonable (within next cycle)
    if (delay < 7 * DAY) {
      await queueJob<NotifyExpiryData>(
        queue,
        JOB_NAME_NOTIFY_EXPIRED,
        getExpiredJobId(memberId),
        {
          code: groupCode,
          type: info.type,
          id: info.id,
          memberId,
        },
        { replace: true, delay }
      );
    }
  }
}

export const handleCheckExpiringJob = async (queue: Queue) => {
  logger.info('Checking for expiring posts');

  const client = new KomunitinClient();

  try {
    const groups = await client.getGroups();
    for (const group of groups) {
      const groupCode = group.attributes.code;

      // Track expired posts by member
      const memberExpiries = new Map<string, MemberExpiryInfo>();

      const processItems = async (items: (Offer | Need)[], type: 'offer' | 'need') => {
        for (const item of items) {
          // Check expiration
          if (!item.attributes.expires) continue;

          const created = new Date(item.attributes.created).getTime();
          const expires = new Date(item.attributes.expires).getTime();
          const now = Date.now();

          const window = expires - created;
          const timeLeft = expires - now;

          const DAY = 24 * 60 * 60 * 1000;
          const memberId = item.relationships.member.data.id;

          // Handle already expired items
          if (timeLeft <= 0) {
            
            const expiryDate = new Date(item.attributes.expires);

            const current = memberExpiries.get(memberId);
            if (!current || expiryDate > current.expires) {
              memberExpiries.set(memberId, { type, id: item.id, expires: expiryDate });
            }
            continue;
          }

          if (timeLeft <= 7 * DAY) {
            if (window > 30 * DAY ) {
              // Immediately create 7-day notification, however it won't be re-processed if we have already
              // created it before (even if it is already completed).
              await queueJob<NotifyExpiryData>(
                queue,
                JOB_NAME_NOTIFY_EXPIRY,
                `expiry-7d:${item.id}`,
                { 
                  code: groupCode, 
                  type, 
                  id: item.id, 
                  memberId
                },
                { removeOnComplete: { age: 30 * 24 * 60 * 60 } } // keep completed jobs for 30 days
              );
            }
            // Queue the 24-hour notification
            const delay = timeLeft - DAY;
            await queueJob<NotifyExpiryData>(
              queue,
              JOB_NAME_NOTIFY_EXPIRY,
              `expiry-24h:${item.id}`,
              { 
                code: groupCode, 
                type, 
                id: item.id,
                memberId
              },
              { 
                delay: delay > 0 ? delay : 0,
                removeOnComplete: { age: 7 * 24 * 60 * 60 } // keep completed jobs for 7 days
              }
            );
          }
        }
      };

      // Fetch offers and needs
      const expireBeforeDate = new Date();
      expireBeforeDate.setDate(expireBeforeDate.getDate() + 7);

      const offers = await client.getOffers(groupCode, { "filter[expire][lt]": expireBeforeDate.toISOString() });
      await processItems(offers, 'offer');

      const needs = await client.getNeeds(groupCode, { "filter[expire][lt]": expireBeforeDate.toISOString() });
      await processItems(needs, 'need');

      // Schedule notifications for members with expired posts
      await processMemberExpiries(queue, groupCode, memberExpiries);

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

export const handleNotifyExpiredJob = async (job: Job<NotifyExpiryData>) => {
  const { code, type, id } = job.data;

  await dispatchSyntheticEvent({
    name: EVENT_NAME.ExpiredPosts,
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
      [JOB_NAME_NOTIFY_EXPIRED]: (job: Job<NotifyExpiryData>) => handleNotifyExpiredJob(job),
    },
    stop: async () => { }
  };
};
