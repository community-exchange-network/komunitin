import cron from 'node-cron';
import { runNewsletter } from './service';

type WorkerHandle = {
  stop: () => Promise<void>;
};

export const runNewsletterWorker = async (): Promise<WorkerHandle> => {
  const task = cron.schedule('30 * * * *', () => {
    runNewsletter();
  });

  return {
    stop: async () => {
      task.stop();
    }
  };
};

export default runNewsletterWorker;
