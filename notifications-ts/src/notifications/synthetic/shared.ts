import { Queue, JobsOptions } from 'bullmq';
import { dispatchEvent } from '../worker';
import { NotificationEvent } from '../events';

export const QUEUE_NAME = 'synthetic-events';

export const dispatchSyntheticEvent = async (event: Pick<NotificationEvent, "name" | "code" | "data"> & { user?: string }) => {
  await dispatchEvent({
    id: `synth-event-${Date.now()}`,
    user: '',
    ...event,
    source: 'notifications-synthetic-events',
    time: new Date(),
  });
};

type QueueJobOptions = JobsOptions & { replace?: boolean };

export const queueJob = async <T>(
  queue: Queue<T>,
  name: string,
  id: string,
  data: T,
  opts?: QueueJobOptions
) => {
  const existing = await queue.getJob(id);
  if (existing && !opts?.replace) {
    return existing;
  } else if (existing && opts?.replace) {
    await existing.remove();
  }
  // Cast to any to work around BullMQ's complex type constraints
  return (queue as any).add(name, data, { jobId: id, ...opts });
};
