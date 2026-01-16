import { createClient } from 'redis';
import { config } from '../config';
import logger from './logger';

const redisUrl = config.NOTIFICATIONS_REDIS_URL;

export const redis = createClient({ url: redisUrl });

redis.on('error', (err) => logger.error(err, 'Redis client error'));

// Connect function to be called at application startup
export const connectRedis = async () => {
  while (true) {
    try {
      if (!redis.isOpen) {
        await redis.connect();
        logger.info('Connected to Redis');
        return;
      }
    } catch (err) {
      logger.warn(err, 'Failed to connect to Redis. Retrying in 1s...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};
