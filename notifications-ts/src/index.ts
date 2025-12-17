import 'dotenv/config';
import logger from './utils/logger';

import cron from 'node-cron';
import { runNewsletter } from './cron/newsletter';

const main = async () => {
  logger.info('Starting notifications-ts service...');

  // Schedule newsletter: Every Monday at 9am
  cron.schedule('0 9 * * 1', () => {
    runNewsletter();
  });

  // Also run immediately on startup for verification (optional/dev only)
  if (process.env.NODE_ENV === 'development') {
    // runNewsletter();
  }

  // Prevent direct exit, keep process alive for cron jobs
  const keepAlive = setInterval(() => { }, 1000 * 60 * 60);

  const shutdown = () => {
    logger.info('Shutting down...');
    clearInterval(keepAlive);
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

main().catch((err) => {
  logger.error(err, 'Fatal error in main process');
  process.exit(1);
});
