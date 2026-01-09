import { eventBus } from '../event-bus';
import { EVENT_NAME } from '../events';
import logger from '../../utils/logger';
import { EnrichedEvent } from '../enriched-events';

export const initEmailChannel = (): (() => void) => {
  logger.info('Initializing email notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, handleEvent),
    eventBus.on(EVENT_NAME.TransferPending, handleEvent),
    eventBus.on(EVENT_NAME.TransferRejected, handleEvent),

    // Post events
    eventBus.on(EVENT_NAME.NeedPublished, handleEvent),
    eventBus.on(EVENT_NAME.NeedExpired, handleEvent),
    eventBus.on(EVENT_NAME.OfferPublished, handleEvent),
    eventBus.on(EVENT_NAME.OfferExpired, handleEvent),

    // Member events
    eventBus.on(EVENT_NAME.MemberJoined, handleEvent),
    eventBus.on(EVENT_NAME.MemberRequested, handleEvent),

    // Group events
    eventBus.on(EVENT_NAME.GroupRequested, handleEvent),
    eventBus.on(EVENT_NAME.GroupActivated, handleEvent),
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};

const handleEvent = async (event: EnrichedEvent): Promise<void> => {
  try {
    logger.info({ eventName: event.name }, 'Email channel received event');
    
    // TODO: Implement email notification logic
    // 1. Check user preferences (emails.myAccount)
    // 2. Generate rich HTML email template
    // 3. Send via email service (using existing Mailer)
    // 4. Handle bounces/failures
  } catch (err) {
    logger.error({ err, event }, 'Error in email channel');
  }
};
