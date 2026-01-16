import { Queue } from 'bullmq';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Group, Need, Offer, UserSettings } from '../../clients/komunitin/types';
import { getCachedActiveGroups, getCachedGroupMembersWithUsers } from '../../utils/cached-resources';
import logger from '../../utils/logger';
import prisma from '../../utils/prisma';
import { isMemberUser, isPostUrgent } from '../channels/app/post';
import { EVENT_NAME } from '../events';
import { dispatchSyntheticEnrichedEvent } from './shared';

/**
 * Poll-based digest cron.
 * 
 * Periodically checks for users who should receive a PostsPublishedDigest.
 * Uses AppNotification timestamps to determine eligibility.
 * 
 * Strategy:
 * 1. Fetch recent posts from API
 * 2. Early return if no new content
 * 3. Query AppNotification for last digest timestamps (batch)
 * 4. For each user, filter eligible posts and check send rules
 * 5. Fire synthetic event for eligible users
 */

const JOB_NAME_GROUP_DIGEST_CRON = 'group-digest-cron';

// Digest thresholds
const MIN_ITEMS_FAST = 3;        // 3+ items → send after MIN_DAYS_FAST
const MIN_SILENCE_DAYS_FAST = 2;         // days before sending with 3+ items
const MIN_SILENCE_DAYS_SLOW = 7;         // days before sending with 1+ items
const POSTS_LOOKBACK_DAYS = 14;  // how far back to look for posts

/**
 * Calculate days since a date
 */
const daysSince = (date: Date | string): number => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
};

/**
 * Check if a user should receive a digest based on their posts and last sent time.
 */
const shouldSendPostDigest = (
  settings: UserSettings,
  postsForUser: (Offer | Need)[],
  lastSentAt: Date | null
): boolean => {
  if (postsForUser.length === 0) return false;

  // User settings
  if (!settings.attributes.notifications.newOffers && !settings.attributes.notifications.newNeeds) {
    return false;
  }

  // Send only if 3+ items and 2+ silence days OR 1+ items and 7+ silence days
  const silenceDays = daysSince(lastSentAt ?? new Date(0));

  // Fast path: 3+ items and 2+ days old
  if (postsForUser.length >= MIN_ITEMS_FAST && silenceDays >= MIN_SILENCE_DAYS_FAST) {
    return true;
  }

  // Slow path: 1+ items and 7+ days old
  if (postsForUser.length > 0 && silenceDays >= MIN_SILENCE_DAYS_SLOW) {
    return true;
  }

  return false;
};



/**
 * Process digest for a single community.
 */
const processCommunityDigest = async (
  client: KomunitinClient,
  group: Group
): Promise<void> => {
  const code = group.attributes.code;
  logger.debug({ code }, 'Processing digest for community');

  // 1. Fetch recent posts (offers and needs)
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - POSTS_LOOKBACK_DAYS);
  const lookbackIso = lookbackDate.toISOString();

  const [offers, needs] = await Promise.all([
    client.getOffers(code, { 'filter[created][gt]': lookbackIso }),
    client.getNeeds(code, { 'filter[created][gt]': lookbackIso }),
  ]);

  const allPosts = [...offers, ...needs];

  // Filter out urgent posts (they get immediate notification)
  const nonUrgentPosts = allPosts.filter(p => !isPostUrgent(p));
  if (nonUrgentPosts.length === 0) {
    logger.debug({ code }, 'All recent posts are urgent, skipping digest');
    return;
  }

  // Get members with users (cached)
  const membersWithUsers = await getCachedGroupMembersWithUsers(client, code);
  
  // Compute flat users with settings
  const usersWithSetingsMap = new Map(
    membersWithUsers.flatMap(mwu => mwu.users).map(u => [u.user.id, u])
  )
  const usersWithSetings = usersWithSetingsMap.values()

  // Get lastest PostsPublishedDigest notifications for all users in this community = tenant
  const lastDigests = await prisma.appNotification.groupBy({
    by: ['userId'],
    where: {
      tenantId: code,
      eventName: EVENT_NAME.PostsPublishedDigest,
    },
    _max: { createdAt: true },
  });

  const lastDigestMap = new Map(
    lastDigests.map(d => [d.userId, d._max.createdAt])
  );

  // For each user, determine if they should receive a digest

  for (const { user, settings } of usersWithSetings) {
    
    const lastSentAt = lastDigestMap.get(user.id) ?? null;

    // Filter posts for this user:
    // - Created after their last digest (or all if never sent)
    // - Not authored by this user
    const postsForUser = nonUrgentPosts.filter(p => {
      const createdAt = new Date(p.attributes.created);
      const afterLastDigest = !lastSentAt || createdAt > lastSentAt;
      const notAuthor = !isMemberUser(user, p.relationships.member.data.id);
      return afterLastDigest && notAuthor;
    });

    if (!shouldSendPostDigest(settings, postsForUser, lastSentAt)) {
      continue;
    }

    const digestOffers = postsForUser.filter((p): p is Offer => p.type === 'offers');
    const digestNeeds = postsForUser.filter((p): p is Need => p.type === 'needs');

    logger.debug(
      { userId: user.id, code, offerCount: digestOffers.length, needCount: digestNeeds.length },
      'Sending PostsPublishedDigest'
    );

    const memberIds = new Set(postsForUser.map(post => post.relationships.member.data.id));
    const digestMembers = membersWithUsers
      .map(mwu => mwu.member)
      .filter(member => memberIds.has(member.id));

    await dispatchSyntheticEnrichedEvent({
      name: EVENT_NAME.PostsPublishedDigest,
      code,
      group,
      data: {},
      members: digestMembers,
      users: [{ user, settings }],
      offers: digestOffers,
      needs: digestNeeds,
    });
  }

};

/**
 * Main digest cron handler.
 */
const handleDigestCron = async (): Promise<void> => {
  logger.info('Running digest cron');
  const client = new KomunitinClient();

  try {
    // Fetch active groups (cached)
    const activeGroups = await getCachedActiveGroups(client);

    for (const group of activeGroups) {
      try {
        await processCommunityDigest(client, group);
      } catch (err) {
        logger.error({ err, code: group.attributes.code }, 'Error processing community digest');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Error in digest cron');
    throw err;
  }
};

/**
 * Schedule the digest cron job.
 */
const scheduleDigestCron = async (queue: Queue): Promise<void> => {
  await queue.upsertJobScheduler(
    'digest-cron-scheduler',
    { pattern: '*/15 * * * *' }, // Every 15 minutes
    {
      name: JOB_NAME_GROUP_DIGEST_CRON,
    }
  );
};

/**
 * Initialize digest cron.
 */
export const initDigestCron = (queue: Queue) => {
  scheduleDigestCron(queue).catch(err => {
    logger.error({ err }, 'Failed to schedule digest cron');
  });

  return {
    handlers: {
      [JOB_NAME_GROUP_DIGEST_CRON]: () =>   handleDigestCron(),
    },
  };
};
