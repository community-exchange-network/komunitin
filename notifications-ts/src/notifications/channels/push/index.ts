import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import logger from '../../../utils/logger';
import { EnrichedEvent } from '../../enriched-events';

export const initPushChannel = (): (() => void) => {
  logger.info('Initializing push notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, handleEvent),
    eventBus.on(EVENT_NAME.TransferPending, handleEvent),
    eventBus.on(EVENT_NAME.TransferRejected, handleEvent),

  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};

const handleEvent = async (event: EnrichedEvent): Promise<void> => {
  try {
    logger.info({ eventName: event.name }, 'Push channel received event');
    
    // TODO: Implement push notification logic
    // 1. Check user preferences (notifications.myAccount, etc.)
    // 2. Get push tokens from database/subscriptions
    // 3. Generate message
    // 4. Send via Web Push endpoint
    // 5. Handle failed tokens (unregister)
  } catch (err) {
    logger.error({ err, event }, 'Error in push channel');
  }
};
