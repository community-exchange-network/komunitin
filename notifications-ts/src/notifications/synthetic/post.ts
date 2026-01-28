import { Job, Queue } from 'bullmq';
import { EVENT_NAME } from '../events';
import logger from '../../utils/logger';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Offer, Need } from '../../clients/komunitin/types';
import { dispatchSyntheticEvent } from './shared';
import { queueJob } from '../../utils/queue-job';
import { getCachedActiveGroups } from '../../utils/cached-resources';

/**
 * Post synthetic events - Expiration handling
 *
 * This module handles synthetic events related to post expiration:
 * - PostExpiresSoon: Notify users when their posts are about to expire
 * - MemberHasExpiredPosts: Remind users about their expired posts
 *
 * It periodically checks for posts that are expired or expiring before 7 days.
 * For posts expiring soon, it schedules notifications at 7 days and 24 hours before expiration.
 * For already expired posts, it aggregates them by member and schedules notifications at
 * increasing intervals: 7 days, 30 days, then every 90 days after the latest expiration.
 */

const JOB_NAME_POST_EXPIRATION_CRON = 'post-expiration-cron';
const SCHEDULER_NAME_POST_EXPIRATION_CRON = 'scheduler-post-expirations-cron';

const JOB_NAME_NOTIFY_POST_EXPIRES_SOON = 'notify-post-expires-soon';
const JOB_NAME_NOTIFY_MEMBER_HAS_EXPIRED_POSTS = 'notify-member-has-expired-posts';


// Data in the job queue for notifying about post expiry
export type NotifyExpiryData = {
  code: string;
  type: 'offer' | 'need';
  id: string;
  memberId: string;
};

// Info about the post that has expired last for a member
type MemberExpiryInfo = {
  type: 'offer' | 'need';
  id: string;
  expires: Date;
};

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
        JOB_NAME_NOTIFY_MEMBER_HAS_EXPIRED_POSTS,
        `member-has-expired-posts:${memberId}`,
        {
          code: groupCode,
          type: info.type,
          id: info.id,
          memberId,
        },
        {
          replace: true,
          delay
        }
      );
    }
  }
}

export const handleCheckExpiringJob = async (queue: Queue) => {
  logger.info('Checking for expiring posts');

  const client = new KomunitinClient();

  try {
    const groups = await getCachedActiveGroups(client);
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

            let current = memberExpiries.get(memberId);
            if (!current || expiryDate > current.expires) {
              memberExpiries.set(memberId, {
                type,
                id: item.id,
                expires: expiryDate,
              });
            }
            continue;
          }
          // Handle posts expiring within 7 days
          if (timeLeft <= 7 * DAY) {
            const data = {
              code: groupCode,
              type,
              id: item.id,
              memberId,
            }
            if (window > 30 * DAY) {
              // Immediately create 7-day notification, however it won't be re-processed if we have already
              // created it before (even if it is already completed) because queueJob don't add repeated ids.
              await queueJob<NotifyExpiryData>(
                queue,
                JOB_NAME_NOTIFY_POST_EXPIRES_SOON,
                `post-expires-in-7d:${item.id}`,
                data,
                { removeOnComplete: { age: 30 * 24 * 60 * 60 } } // keep completed jobs for 30 days
              );
            }
            // Queue the 24-hour notification
            const delay = timeLeft - DAY;
            await queueJob<NotifyExpiryData>(
              queue,
              JOB_NAME_NOTIFY_POST_EXPIRES_SOON,
              `post-expires-in-24h:${item.id}`,
              data,
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

const handleNotifyPostExpiresSoon = async (job: Job<NotifyExpiryData>) => {
  const { code, type, id } = job.data;

  await dispatchSyntheticEvent({
    name: EVENT_NAME.PostExpiresSoon,
    code,
    data: {
      [type]: id
    }
  });
};

const handleNotifyMemberHasExpiredPosts = async (job: Job<NotifyExpiryData>) => {
  const { code, memberId } = job.data;

  await dispatchSyntheticEvent({
    name: EVENT_NAME.MemberHasExpiredPosts,
    code,
    data: {
      member: memberId
    }
  });
};

const schedulePostExpirationCheck = async (queue: Queue) => {
  await queue.upsertJobScheduler(
    SCHEDULER_NAME_POST_EXPIRATION_CRON,
    { pattern: '0 */4 * * *' },
    {
      name: JOB_NAME_POST_EXPIRATION_CRON,
    }
  );
};

const stopPostExpirationCheck = async (queue: Queue) => {
  await queue.removeJobScheduler(SCHEDULER_NAME_POST_EXPIRATION_CRON);
}

/**
 * Initialize post expiration synthetic events.
 * Returns job handlers.
 */
export const initPostEvents = (queue: Queue) => {
  schedulePostExpirationCheck(queue).catch(err => {
    logger.error({ err }, 'Failed to schedule post expiration check');
  });

  return {
    handlers: {
      [JOB_NAME_POST_EXPIRATION_CRON]: () => handleCheckExpiringJob(queue),
      [JOB_NAME_NOTIFY_POST_EXPIRES_SOON]: (job: Job<NotifyExpiryData>) => handleNotifyPostExpiresSoon(job),
      [JOB_NAME_NOTIFY_MEMBER_HAS_EXPIRED_POSTS]: (job: Job<NotifyExpiryData>) => handleNotifyMemberHasExpiredPosts(job),
    },
    stop: async () => {
      await stopPostExpirationCheck(queue);
    },
  };
};
