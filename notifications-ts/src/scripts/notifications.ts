import 'dotenv/config';
import { handleDigestCron } from '../notifications/synthetic/digest-cron';
import { handleCheckExpiringJob } from '../notifications/synthetic/post';
import { QUEUE_NAME } from '../notifications/synthetic/shared';
import logger from '../utils/logger';
import { connectRedis } from '../utils/redis';
import { createQueue } from '../utils/queue';

async function main() {
  const args = process.argv.slice(2);
  let runDigests = false;
  let runExpired = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') {
      console.log(`
Usage: pnpm notifications [options]

Options:
  --digests     Run digest processn only
  --expired     Run expired posts check only
  --help        Show this help message
      `);
      process.exit(0);
    }
    if (args[i] === '--digests') {
      runDigests = true;
    } else if (args[i] === '--expired') {
      runExpired = true;
    }
  }

  if (!runDigests && !runExpired) {
    runDigests = true;
    runExpired = true;
  }

  logger.info('Starting manual notifications run...');
  await connectRedis();

  try {
    if (runExpired) {
      logger.info('Running expired posts check...');
      const queue = createQueue(QUEUE_NAME);
      await handleCheckExpiringJob(queue);
      await queue.close();
      logger.info('Expired posts check completed.');
    }

    if (runDigests) {
      logger.info('Running digest process...');
      await handleDigestCron();
      logger.info('Digest process completed.');
    }
    logger.info('Manual notifications run completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error(error, 'Error during manual notifications run');
    process.exit(1);
  }
}

main();