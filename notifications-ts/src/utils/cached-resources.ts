import { cache } from './cache';
import logger from './logger';
import { KomunitinClient } from '../clients/komunitin/client';
import { Group, Member, User, UserSettings } from '../clients/komunitin/types';

// Default TTL for resources: 24 hours
export const CACHE_TTL_24H = 24 * 60 * 60 * 1000;
export const CACHE_TTL_NO_CACHE = 0;

const DEFAULT_TTL = CACHE_TTL_24H;

export type MemberWithUsers = {
  member: Member;
  users: Array<{ user: User; settings: UserSettings }>;
};

/**
 * Get active groups from cache or API
 */
export const getCachedActiveGroups = (
  client: KomunitinClient,
  ttl: number = DEFAULT_TTL
): Promise<Group[]> => {
  const key = 'groups:active';

  return cache.get(key, async () => {
    logger.info('Fetching active groups (cache miss)');
    return client.getGroups({ 'filter[status]': 'active' });
  }, ttl);
};

/**
 * Get group members with their users from cache or API
 */
export const getCachedGroupMembersWithUsers = (
  client: KomunitinClient,
  groupCode: string,
  ttl: number = DEFAULT_TTL
): Promise<MemberWithUsers[]> => {
  const key = `group:${groupCode}:members`;

  return cache.get(key, async () => {
    logger.info({ groupCode }, 'Fetching members and users (cache miss)');
    const members = await client.getMembers(groupCode);
    const result: MemberWithUsers[] = [];

    for (const member of members) {
      try {
        const users = await client.getMemberUsers(member.id);
        result.push({ member, users });
      } catch (err) {
        logger.warn({ err, memberId: member.id }, 'Failed to fetch member users, skipping');
      }
    }

    return result;
  }, ttl);
};
