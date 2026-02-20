import { KomunitinClient } from '../clients/komunitin/client';
import { Member, User, UserSettings } from '../clients/komunitin/types';
import { cache } from './cache';
import logger from './logger';

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
export const getCachedActiveGroups = async (client: KomunitinClient, ttl: number = DEFAULT_TTL) => {
  return await cache.get('groups:active', async () => client.getGroups({ 'filter[status]': 'active' }), ttl);
}

export const getCachedGroup = async (client: KomunitinClient, groupCode: string, ttl: number = DEFAULT_TTL) => {
  return await cache.get(`group:${groupCode}`, async () => client.getGroup(groupCode), ttl);
}
/**
 * Get a currency from cache or API
 */
export const getCachedCurrency = async (client: KomunitinClient, groupCode: string, ttl: number = DEFAULT_TTL) => {
  return await cache.get(`currency:${groupCode}`, async () => client.getCurrency(groupCode), ttl);
};

/**
 * Get group members with their users from cache or API
 */
export const getCachedGroupMembersWithUsers = async (client: KomunitinClient, groupCode: string, ttl: number = DEFAULT_TTL) => {
  const key = `group:${groupCode}:members`;

  return await cache.get(key, async () => {
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
