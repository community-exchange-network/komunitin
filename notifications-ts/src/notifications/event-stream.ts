import { randomUUID } from 'crypto';
import { createClient } from 'redis';
import { config } from '../config';
import logger from '../utils/logger';
import { NotificationEvent } from './events';

const EVENT_STREAM_NAME = 'events';
const EVENT_STREAM_GROUP = 'notifications-ts';

class EventsStream {
  private client: ReturnType<typeof createClient>;
  private streamName: string;
  private group: string;
  private consumerId: string;

  private constructor(client: ReturnType<typeof createClient>, streamName: string, group: string, consumerId: string) {
    this.client = client;
    this.streamName = streamName;
    this.group = group;
    this.consumerId = consumerId;
  }

  static async connect(options?: { redisUrl?: string }): Promise<EventsStream> {
    const streamName = EVENT_STREAM_NAME;
    const group = EVENT_STREAM_GROUP;
    const redisUrl = options?.redisUrl ?? config.NOTIFICATIONS_REDIS_URL;
    const consumerId = randomUUID();

    const client = createClient({ url: redisUrl });
    client.on('error', (err) => logger.error(err, 'Redis client error'));
    await client.connect();

    const stream = new EventsStream(client, streamName, group, consumerId);
    await stream.ensureGroup();
    return stream;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async getNext(): Promise<NotificationEvent> {
    const result = await this.client.xReadGroup(
      this.group,
      this.consumerId,
      { key: this.streamName, id: '>' },
      { BLOCK: 0, COUNT: 1 }
    );

    if (!result || result.length === 0 || result[0].messages.length === 0) {
      throw new Error('No message returned by XREADGROUP');
    }

    const entry = result[0].messages[0];
    return this.parseEntry(entry);
  }

  async ack(id: string): Promise<void> {
    await this.client.xAck(this.streamName, this.group, id);
  }

  private async ensureGroup(): Promise<void> {
    try {
      await this.client.xGroupCreate(this.streamName, this.group, '$', { MKSTREAM: true });
      logger.info({ stream: this.streamName, group: this.group }, 'Created events consumer group');
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('BUSYGROUP')) {
        // Group already exists; nothing else to do.
        return;
      }
      throw err;
    }
  }

  private parseEntry(entry: { id: string; message: Record<string, string> }): NotificationEvent {
    const { id, message } = entry;

    const timeValue = message.time;
    const time = new Date(typeof timeValue === 'string' ? timeValue : '');
    if (Number.isNaN(time.getTime())) {
      throw new Error(`Invalid event time for entry ${id}`);
    }

    const rawData = message.data;
    const parsedData = this.parseData(rawData, id);

    return {
      id,
      name: String(message.name ?? '') as any, // Cast to any to fit NotificationEvent.name type which is stricter now
      source: String(message.source ?? ''),
      code: String(message.code ?? ''),
      time,
      data: parsedData,
      user: String(message.user ?? ''),
    };
  }

  private parseData(value: unknown, id: string): Record<string, string> {
    if (typeof value !== 'string') {
      return {};
    }

    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const data: Record<string, string> = {};
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === 'string') {
          data[key] = val;
        }
      }
      return data;
    } catch (err) {
      throw new Error(`Invalid JSON in event data for entry ${id}`);
    }
  }
}

export const createEventsStream = async (options?: { redisUrl?: string }): Promise<EventsStream> => {
  return EventsStream.connect(options);
};

export default EventsStream;
