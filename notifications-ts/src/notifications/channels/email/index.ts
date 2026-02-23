import logger from '../../../utils/logger';
import { ctxPasswordReset, ctxValidationEmail } from '../../emails/user';
import { ctxWelcomeEmail } from '../../emails/member';
import { EnrichedMemberEvent, EnrichedUserEvent } from '../../enriched-events';
import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import { handleEmailEvent } from './utils';

export const initEmailChannel = (): (() => void) => {
  logger.info('Initializing email notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Member events
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => 
      handleEmailEvent(event, event.users, "message", ctxWelcomeEmail
    )),


    // User events
    eventBus.on(EVENT_NAME.ValidationEmailRequested, async (event: EnrichedUserEvent) => 
      handleEmailEvent(event, [event.target], "message", ctxValidationEmail
    )),
    eventBus.on(EVENT_NAME.PasswordResetRequested, async (event: EnrichedUserEvent) => 
      handleEmailEvent(event, [event.target], "message", ctxPasswordReset
    )),
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};
