import type { Queue, JobsOptions } from 'bullmq';

export type QueueJobOptions = JobsOptions & { replace?: boolean; };

/**
 * Helper to add a job to a queue with a specific ID, optionally replacing an existing job.
 */
export const queueJob = async <T>(
  queue: Queue<T>,
  name: string,
  id: string,
  data: T,
  opts?: QueueJobOptions
) => {
  const existing = await (queue as any).getJob(id);
  if (existing && !opts?.replace) {
    return existing;
  } else if (existing && opts?.replace) {
    await existing.remove();
  }
  // Cast to any to work around BullMQ's complex type constraints
  return (queue as any).add(name, data, { jobId: id, ...opts });
};
