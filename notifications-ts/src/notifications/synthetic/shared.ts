import { dispatchEvent } from '../worker';
import { NotificationEvent } from '../events';
import { EnrichedEvent } from '../enriched-events';
import { eventBus } from '../event-bus';

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

/**
 * If the synthetic event generation produces already enriched events, we can use this
 * function to skip the enrichment step and directly dispatch them to the event bus.
 * @param event 
 */
export const dispatchSyntheticEnrichedEvent = async <T extends Omit<EnrichedEvent, "id" | "user" | "source" | "time">> (event: T) => {
  await eventBus.emit({
    id: `synth-enriched-event-${Date.now()}`,
    user: '',
    ...event,
    source: 'notifications-synthetic-events',
    time: new Date(),
  });
}