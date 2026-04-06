import type { Job } from 'bullmq';
import { createQueue, createWorker } from '../utils/queue';
import logger from '../utils/logger';
import type { AnyNotificationEvent } from '../notifications/events';

const QUEUE_NAME = 'events';

/**
 * In the queue the date field must be serialized as a string.
 */
type EventJobData = Omit<AnyNotificationEvent, 'time'> & { time: string };
const jobToEvent = (job: Job<EventJobData>): AnyNotificationEvent => ({
  ...job.data,
  time: new Date(job.data.time),
})
const eventToJobData = (event: AnyNotificationEvent): EventJobData => ({
  ...event,
  time: event.time.toISOString(),
});

let eventsQueue: ReturnType<typeof createQueue<EventJobData>> | undefined;

const getEventsQueue = () => {
  if (!eventsQueue) {
    eventsQueue = createQueue<EventJobData>(QUEUE_NAME);
  }
  return eventsQueue;
};

/**
 * Add an event to the BullMQ events queue.
 * Called by the events HTTP endpoint.
 */
export const addEvent = async (event: AnyNotificationEvent) => {
  const queue = getEventsQueue();
  return queue.add(event.name, eventToJobData(event));
};

/**
 * Start the BullMQ worker that processes events from the queue.
 * Returns a stop function to gracefully shut down.
 */
export const startEventWorker = (processor: (event: AnyNotificationEvent) => Promise<void>) => {
  const worker = createWorker<EventJobData>(
    QUEUE_NAME,
    async (job: Job<EventJobData>) => {
      const event = jobToEvent(job);
      logger.info({ eventName: event.name, eventId: event.id }, 'Processing event');
      await processor(event);
    },
  );

  worker.on('failed', (job, err) => {
    logger.error({ err, jobId: job?.id, eventName: job?.data?.name }, 'Event processing failed');
  });

  return async () => {
    await worker.close();
    if (eventsQueue) {
      await eventsQueue.close();
      eventsQueue = undefined;
    }
  };
};
