import { redis } from './redis';
import logger from './logger';

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

const HARD_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

class CacheService {
  private pendingPromises: Map<string, Promise<any>> = new Map();

  /**
   * Get data from cache or fetch it if expired or forced.
   * 
   * @param key Unique cache key
   * @param fetcher Function to fetch the data
   * @param ttl Logical time to live in milliseconds
   * @param force Force refresh the cache
   * @returns The data
   */
  async get<T>(key: string, fetcher: () => Promise<T>, ttl: number, force: boolean = false): Promise<T> {
    // 1. Stampede protection: check if fetch is already in progress locally
    if (this.pendingPromises.has(key)) {
      return this.pendingPromises.get(key) as Promise<T>;
    }

    // 2. Try to get data from Redis
    try {
      if (!force) {
        const cachedValue = await redis.get(key);
        if (cachedValue) {
          const entry = JSON.parse(cachedValue) as CacheEntry<T>;
          const now = Date.now();

          // Check logical TTL
          if (now - entry.timestamp < ttl) {
            return entry.data;
          }
        }
      }
    } catch (err) {
      logger.error({ err, key }, 'Error reading from Redis cache');
      // Fallthrough to fetcher on error
    }


    // Double-check stampede protection after async Redis call
    if (this.pendingPromises.has(key)) {
      return this.pendingPromises.get(key) as Promise<T>;
    }

    // 3. Fetch data (with stampede protection)
    const promise = (async () => {
      try {
        logger.info({ key }, 'Cache miss, fetching data');
        const result = await fetcher();

        // Save to Redis
        await this.save(key, result);

        return result;
      } finally {
        this.pendingPromises.delete(key);
      }
    })();

    this.pendingPromises.set(key, promise);
    return promise;
  }

  private async save<T>(key: string, data: T): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now()
      };

      await redis.set(key, JSON.stringify(entry), {
        EX: HARD_TTL_SECONDS
      });
    } catch (err) {
      logger.error({ err, key }, 'Error writing to Redis cache');
    }
  }
}

export const cache = new CacheService();
