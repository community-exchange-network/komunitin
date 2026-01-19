import { createClient } from 'redis';
import { config } from '../config';
import logger from './logger';

const redisUrl = config.REDIS_URL;

export const redis = createClient({ url: redisUrl });

logger.info(`Creating Redis client for URL: ${redisUrl}`);

redis.on('error', (err) => logger.error(err, 'Redis client error'));

// Connect function to be called at application startup
export const connectRedis = async () => {
  while (true) {
    try {
      if (!redis.isOpen) {
        await redis.connect();
        logger.info(`Connected to Redis at ${redisUrl}`);
        return;
      }
    } catch (err) {
      logger.warn(err, `Failed to connect to Redis at ${redisUrl}, retrying in 1 second`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};
