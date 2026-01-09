import 'dotenv/config';
import logger from './utils/logger';

import { runNewsletterWorker } from './newsletter/worker';
import { runNotificationsWorker } from './notifications/worker';
import { startServer } from './server';

const main = async () => {
  logger.info('Starting notifications-ts service...');

  const { stop: stopNotifications } = await runNotificationsWorker();
  const { stop: stopNewsletter } = await runNewsletterWorker();
  const { stop: stopServer } = startServer();

  // Prevent direct exit, keep process alive for cron jobs
  const keepAlive = setInterval(() => { }, 1000 * 60 * 60);

  const shutdown = () => {
    logger.info('Shutting down...');
    stopNotifications().catch((err) => logger.error(err, 'Error stopping notifications worker'));
    stopNewsletter().catch((err) => logger.error(err, 'Error stopping newsletter worker'));
    stopServer().catch((err) => logger.error(err, 'Error stopping server'));
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
