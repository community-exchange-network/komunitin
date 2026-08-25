import { KomunitinClient } from '../clients/komunitin/client';
import { cache } from './cache';

// Default TTL for resources: 24 hours
export const CACHE_TTL_24H = 24 * 60 * 60 * 1000;
export const CACHE_TTL_NO_CACHE = 0;

const DEFAULT_TTL = CACHE_TTL_24H;

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
