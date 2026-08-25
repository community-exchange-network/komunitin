import logger from '../../../utils/logger';
import { ctxPasswordReset, ctxValidationEmail } from '../../emails/user';
import { ctxWelcomeEmail, ctxMemberRequestedEmail, ctxMemberExpiredPostsEmail } from '../../emails/member';
import { ctxGroupActivatedEmail, ctxGroupRequestedEmail } from '../../emails/group';
import { EnrichedTransferEvent, EnrichedMemberEvent, EnrichedMemberHasExpiredPostsEvent, EnrichedMemberRequestedEvent, EnrichedGroupEvent, EnrichedUserEvent } from '../../enriched-events';
import { ctxTransferSent, ctxTransferReceived, ctxTransferPending, ctxTransferRejected } from '../../emails/transfer';
import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import {
  handleAccountEmailEvent,
  handleEmailAddressEvent,
  handleMandatoryEmailEvent,
  handleSuperadminEmailEvent,
} from './utils';

export const initEmailChannel = (): (() => void) => {
  logger.info('Initializing email notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Member events
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => 
      handleAccountEmailEvent(event, event.recipients, "message", ctxWelcomeEmail
    )),
    eventBus.on(EVENT_NAME.MemberRequested, async (event: EnrichedMemberRequestedEvent) => 
      handleMandatoryEmailEvent(event, event.adminRecipients, "message", ctxMemberRequestedEmail
    )),
    eventBus.on(EVENT_NAME.MemberHasExpiredPostsRecently, async (event: EnrichedMemberHasExpiredPostsEvent) =>
      handleAccountEmailEvent(event, event.recipients, "post", ctxMemberExpiredPostsEmail
    )),

    // Group events
    eventBus.on(EVENT_NAME.GroupRequested, async (event: EnrichedGroupEvent) =>
      handleSuperadminEmailEvent(event, "message", ctxGroupRequestedEmail)
    ),
    eventBus.on(EVENT_NAME.GroupActivated, async (event: EnrichedGroupEvent) => 
      handleMandatoryEmailEvent(event, event.adminRecipients, "message", ctxGroupActivatedEmail
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
      await handleAccountEmailEvent(event, event.payer.recipients, "transfer", ctxTransferSent);
      // Payee gets "received" email
      await handleAccountEmailEvent(event, event.payee.recipients, "transfer", ctxTransferReceived);
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      // Payer gets "pending" email (they need to accept/reject)
      await handleAccountEmailEvent(event, event.payer.recipients, "transfer", ctxTransferPending);
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      // Payee gets "rejected" email
      await handleAccountEmailEvent(event, event.payee.recipients, "transfer", ctxTransferRejected);
    }),
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};
