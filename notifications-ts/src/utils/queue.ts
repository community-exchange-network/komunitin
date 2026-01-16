import { ConnectionOptions, Queue, QueueOptions, Worker, WorkerOptions, Processor } from 'bullmq';
import { config } from '../config';
import { queueJob, type QueueJobOptions } from './queue-job';

export { queueJob, type QueueJobOptions };

const redisUrl = new URL(config.NOTIFICATIONS_REDIS_URL);

export const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port),
  password: redisUrl.password || undefined,
  username: redisUrl.username || undefined,
};

export const createQueue = <T = any, R = any, N extends string = string>(name: string, opts?: QueueOptions) => {
  return new Queue<T, R, N>(name, { ...opts, connection });
};

export const createWorker = <DataType = any, ResultType = any, NameType extends string = string>(
  name: string, 
  processor: Processor<DataType, ResultType, NameType>, 
  opts?: WorkerOptions
) => {
  return new Worker<DataType, ResultType, NameType>(name, processor, { 
    removeOnComplete: { age: 30 * 24 * 3600 }, // Default Retention 30 days
    ...opts,
    connection });
};

