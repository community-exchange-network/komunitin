import 'dotenv/config';
import { runNewsletter } from '../newsletter/service';
import logger from '../utils/logger';

async function main() {
  const args = process.argv.slice(2);
  let groupCode: string | undefined;
  let memberCode: string | undefined;
  let forceSend = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--group') {
      groupCode = args[i + 1];
      i++;
    } else if (args[i] === '--member') {
      memberCode = args[i + 1];
      i++;
    } else if (args[i] === '--force-send') {
      forceSend = true;
    }
  }

  logger.info('Starting manual newsletter run...');

  if (groupCode) logger.info({ groupCode }, 'Filtering by group');
  if (memberCode) logger.info({ memberCode }, 'Filtering by member');
  if (forceSend) logger.info('Force send enabled - ignoring frequency settings');

  try {
    await runNewsletter({ groupCode, memberCode, forceSend });
    logger.info('Manual newsletter run completed successfully.');
  } catch (error) {
    logger.error(error, 'Error during manual newsletter run');
    process.exit(1);
  }
}

main();
