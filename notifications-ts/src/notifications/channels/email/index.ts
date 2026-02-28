import logger from '../../../utils/logger';
import { ctxPasswordReset, ctxValidationEmail } from '../../emails/user';
import { ctxWelcomeEmail, ctxMemberRequestedEmail } from '../../emails/member';
import { ctxGroupActivatedEmail, ctxGroupRequestedEmail } from '../../emails/group';
import { EnrichedTransferEvent, EnrichedMemberEvent, EnrichedMemberRequestedEvent, EnrichedGroupEvent, EnrichedUserEvent } from '../../enriched-events';
import { ctxTransferSent, ctxTransferReceived, ctxTransferPending, ctxTransferRejected } from '../../emails/transfer';
import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import { handleEmailEvent, handleSuperadminEmailEvent } from './utils';

export const initEmailChannel = (): (() => void) => {
  logger.info('Initializing email notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Member events
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => 
      handleEmailEvent(event, event.users, "message", ctxWelcomeEmail
    )),
    eventBus.on(EVENT_NAME.MemberRequested, async (event: EnrichedMemberRequestedEvent) => 
      handleEmailEvent(event, event.adminUsers, "message", ctxMemberRequestedEmail
    )),

    // Group events
    eventBus.on(EVENT_NAME.GroupRequested, async (event: EnrichedGroupEvent) =>
      handleSuperadminEmailEvent(event, "message", ctxGroupRequestedEmail)
    ),
    eventBus.on(EVENT_NAME.GroupActivated, async (event: EnrichedGroupEvent) => 
      handleEmailEvent(event, event.adminUsers, "message", ctxGroupActivatedEmail
    )),

    // User events
    eventBus.on(EVENT_NAME.ValidationEmailRequested, async (event: EnrichedUserEvent) => 
      handleEmailEvent(event, [event.target], "message", ctxValidationEmail
    )),
    eventBus.on(EVENT_NAME.PasswordResetRequested, async (event: EnrichedUserEvent) => 
      handleEmailEvent(event, [event.target], "message", ctxPasswordReset
    )),

    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      // Payer gets "sent" email
      await handleEmailEvent(event, event.payer.users, "transfer", ctxTransferSent);
      // Payee gets "received" email
      await handleEmailEvent(event, event.payee.users, "transfer", ctxTransferReceived);
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      // Payer gets "pending" email (they need to accept/reject)
      await handleEmailEvent(event, event.payer.users, "transfer", ctxTransferPending);
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      // Payee gets "rejected" email
      await handleEmailEvent(event, event.payee.users, "transfer", ctxTransferRejected);
    }),
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};
