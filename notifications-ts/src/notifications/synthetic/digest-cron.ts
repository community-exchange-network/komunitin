import { Queue } from 'bullmq';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Group, Need, Offer, User, UserSettings } from '../../clients/komunitin/types';
import { getCachedActiveGroups, getCachedGroupMembersWithUsers } from '../../utils/cached-resources';
import logger from '../../utils/logger';
import prisma from '../../utils/prisma';
import { EVENT_NAME, EventName } from '../events';
import { dispatchSyntheticEnrichedEvent } from './shared';
import { isPostUrgent } from '../handlers/post';

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

const LOOKBACK_DAYS = 14;  // how far back to look for posts and members

/**
 * Calculate days since a date
 */
const daysSince = (date: Date | string): number => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
};

/**
 * Check if a user is the author of a post.
 */
const isMemberUser = (user: User, memberId: string): boolean => {
  return user.relationships.members.data.some((m: any) => m.id === memberId);
};


/**
 * Check if a user should receive a digest based on their posts and last sent time.
 */
const canSendDigest = (
  count: number,
  lastSentAt: Date | null
): boolean => {
  if (count === 0) return false;

  // Send only if 3+ items and 2+ silence days OR 1+ items and 7+ silence days
  const silenceDays = daysSince(lastSentAt ?? new Date(0));

  // Fast path: 3+ items and 2+ days old
  if (count >= MIN_ITEMS_FAST && silenceDays >= MIN_SILENCE_DAYS_FAST) {
    return true;
  }

  // Slow path: 1+ items and 7+ days old
  if (count > 0 && silenceDays >= MIN_SILENCE_DAYS_SLOW) {
    return true;
  }

  return false;
};


const lastSentMap = async (tenantId: string, eventName: EventName) => {
  const lastPostsDigests = await prisma.appNotification.groupBy({
    by: ['userId'],
    where: {
      tenantId,
      eventName,
    },
    _max: { createdAt: true },
  });
  
  return new Map<string, Date>(
    lastPostsDigests.map(item => [item.userId, item._max.createdAt!])
  );
  
}

const maxDate = (...dates: (Date | null)[]): Date | null => {
  return dates.reduce((max, date) => {
    if (!date) return max;
    if (!max) return date;
    return date > max ? date : max;
  });
}

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
  lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS);
  const lookbackIso = lookbackDate.toISOString();

  const [offers, needs] = await Promise.all([
    client.getOffers(code, { 'filter[created][gt]': lookbackIso }),
    client.getNeeds(code, { 'filter[created][gt]': lookbackIso }),
  ]);

  // 2. Fetch recent members
  const newMembers = await client.getMembers(code, { 'filter[created][gt]': lookbackIso });

  const allPosts = [...offers, ...needs];

  // Filter out urgent posts (they get immediate notification)
  const nonUrgentPosts = allPosts.filter(p => !isPostUrgent(p));
  if (nonUrgentPosts.length === 0 && newMembers.length === 0) {
    logger.debug({ code }, 'No new non-urgent posts or new members, skipping digest');
    return;
  }

  // Get members with users (cached)
  const membersWithUsers = await getCachedGroupMembersWithUsers(client, code);
  
  // Compute flat users with settings
  const usersWithSettingsMap = new Map(
    membersWithUsers.flatMap(mwu => mwu.users).map(u => [u.user.id, u])
  )
  const usersWithSettings = usersWithSettingsMap.values()


  // Get lastest PostsPublishedDigest notifications for all users in this community = tenant
  const lastPostsMap = await lastSentMap(code, EVENT_NAME.PostsPublishedDigest);
  const lastMembersMap = await lastSentMap(code, EVENT_NAME.MembersJoinedDigest);

  // For each user, determine if they should receive a digest
  for (const { user, settings } of usersWithSettings) {
    const lastSentForPosts = lastPostsMap.get(user.id) || null;
    const lastSentForMembers = lastMembersMap.get(user.id) || null;
    const lastSentGlobal = maxDate(lastSentForPosts, lastSentForMembers);

    const newMemberIds = new Set(newMembers.map(m => m.id));
    const isNew = (date: string, lastSent: Date | null) => !lastSent || new Date(date) > lastSent;

    // Take only the members since last digest
    const eligibleNewMembers = newMembers.filter(m => 
      !isMemberUser(user, m.id) && isNew(m.attributes.created, lastSentForMembers)
    );

    // Divide posts into regular and posts from new members, removing the ones
    // that have already been included in previous digests.
    const regularPosts: (Offer | Need)[] = [];
    const newMemberPosts: (Offer | Need)[] = [];

    for (const post of nonUrgentPosts) {
      if (isMemberUser(user, post.relationships.member.data.id)) continue;

      const isFromNewMember = newMemberIds.has(post.relationships.member.data.id);
      const targetList = isFromNewMember ? newMemberPosts : regularPosts;
      const lastSent = isFromNewMember ? lastSentForMembers : lastSentForPosts;

      if (isNew(post.attributes.created, lastSent)) {
        targetList.push(post);
      }
    }

    const canSendPostsDigest = canSendDigest(regularPosts.length, lastSentGlobal);
    const canSendMembersDigest = canSendDigest(eligibleNewMembers.length, lastSentGlobal);

    // If both digests are eligible, take the one with older last sent time and take the new members in case of a tie.
    const sendMembersDigest = canSendMembersDigest && (
      !canSendPostsDigest ||
      (lastSentForMembers ?? new Date(0)) <= (lastSentForPosts ?? new Date(0))
    );
    const sendPostsDigest = canSendPostsDigest && !sendMembersDigest;

    if (sendMembersDigest) {
      const digestOffers = newMemberPosts.filter((p): p is Offer => p.type === 'offers');
      const digestNeeds = newMemberPosts.filter((p): p is Need => p.type === 'needs');
      await dispatchSyntheticEnrichedEvent({
        name: EVENT_NAME.MembersJoinedDigest,
        code,
        group,
        data: {},
        members: eligibleNewMembers,
        users: [{ user, settings }],
        offers: digestOffers,
        needs: digestNeeds,
      });

    } else if (sendPostsDigest) {
      const digestOffers = regularPosts.filter((p): p is Offer => p.type === 'offers');
      const digestNeeds = regularPosts.filter((p): p is Need => p.type === 'needs');
      const postMemberIds = new Set(regularPosts.map(post => post.relationships.member.data.id));
      const digestMembers = membersWithUsers
        .map(mwu => mwu.member)
        .filter(member => postMemberIds.has(member.id));

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
  }

};

/**
 * Main digest cron handler.
 */
export const handleDigestCron = async (): Promise<void> => {
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
      [JOB_NAME_GROUP_DIGEST_CRON]: () => handleDigestCron(),
    },
  };
};
