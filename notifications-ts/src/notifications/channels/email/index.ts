import logger from '../../../utils/logger';
import { ctxPasswordReset, ctxValidationEmail } from '../../emails/user';
import { ctxWelcomeEmail, ctxMemberRequestedEmail, ctxMemberExpiredPostsEmail } from '../../emails/member';
import { ctxGroupActivatedEmail, ctxGroupRequestedEmail } from '../../emails/group';
import { EnrichedTransferEvent, EnrichedMemberEvent, EnrichedMemberHasExpiredPostsEvent, EnrichedMemberRequestedEvent, EnrichedGroupEvent, EnrichedUserEvent } from '../../enriched-events';
import { ctxTransferSent, ctxTransferReceived, ctxTransferPending, ctxTransferRejected } from '../../emails/transfer';
import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import { handleEmailAddressEvent, handleEmailEvent, handleSuperadminEmailEvent } from './utils';

export const initEmailChannel = (): (() => void) => {
  logger.info('Initializing email notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Member events
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => 
      handleEmailEvent(event, event.recipients, "message", ctxWelcomeEmail, 'account'
    )),
    eventBus.on(EVENT_NAME.MemberRequested, async (event: EnrichedMemberRequestedEvent) => 
      handleEmailEvent(event, event.adminRecipients, "message", ctxMemberRequestedEmail, 'mandatory'
    )),
    eventBus.on(EVENT_NAME.MemberHasExpiredPostsRecently, async (event: EnrichedMemberHasExpiredPostsEvent) =>
      handleEmailEvent(event, event.recipients, "post", ctxMemberExpiredPostsEmail, 'account'
    )),

    // Group events
    eventBus.on(EVENT_NAME.GroupRequested, async (event: EnrichedGroupEvent) =>
      handleSuperadminEmailEvent(event, "message", ctxGroupRequestedEmail)
    ),
    eventBus.on(EVENT_NAME.GroupActivated, async (event: EnrichedGroupEvent) => 
      handleEmailEvent(event, event.adminRecipients, "message", ctxGroupActivatedEmail, 'mandatory'
    )),

    // User events
    eventBus.on(EVENT_NAME.ValidationEmailRequested, async (event: EnrichedUserEvent) => 
      handleEmailAddressEvent(
        event,
        event.data.email,
        event.name === EVENT_NAME.ValidationEmailRequested ? event.data.signup?.language : undefined,
        "message",
        ctxValidationEmail
    )),
    eventBus.on(EVENT_NAME.PasswordResetRequested, async (event: EnrichedUserEvent) => 
      handleEmailAddressEvent(event, event.data.email, undefined, "message", ctxPasswordReset
    )),

    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      // Payer gets "sent" email
      await handleEmailEvent(event, event.payer.recipients, "transfer", ctxTransferSent, 'account');
      // Payee gets "received" email
      await handleEmailEvent(event, event.payee.recipients, "transfer", ctxTransferReceived, 'account');
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      // Payer gets "pending" email (they need to accept/reject)
      await handleEmailEvent(event, event.payer.recipients, "transfer", ctxTransferPending, 'account');
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      // Payee gets "rejected" email
      await handleEmailEvent(event, event.payee.recipients, "transfer", ctxTransferRejected, 'account');
    }),
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};
