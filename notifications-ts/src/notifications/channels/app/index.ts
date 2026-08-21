import logger from '../../../utils/logger';
import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import { 
  buildTransferSentMessage, 
  buildTransferReceivedMessage, 
  buildTransferPendingMessage, 
  buildTransferRejectedMessage, 
  buildTransferStillPendingMessage,
  buildSinglePostPublishedMessage,
  buildPostsPublishedDigestMessage,
  buildPostExpiredMessage,
  buildPostExpiresSoonMessage,
  buildMemberHasExpiredPostsMessage,
  buildMembersJoinedDigestMessage,
  buildMemberJoinedMessage,
  buildMemberHasNoPostsMessage,
} from '../../messages';
import {
  EnrichedTransferEvent,
  EnrichedPostEvent,
  EnrichedPostsPublishedDigestEvent,
  EnrichedMemberHasExpiredPostsEvent,
  EnrichedMembersJoinedDigestEvent,
  EnrichedMemberEvent,
  EnrichedMemberHasNoPostsEvent,
} from '../../enriched-events';
import { handleNotificationForRecipients } from './utils';

export const initInAppChannel = (): (() => void) => {
  logger.info('Initializing in-app notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      const { payer, payee } = event;
      await handleNotificationForRecipients(event, payer.recipients, (ctx) =>
        buildTransferSentMessage(event, ctx)
      );
      await handleNotificationForRecipients(event, payee.recipients, (ctx) =>
        buildTransferReceivedMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await handleNotificationForRecipients(event, payer.recipients, (ctx) =>
        buildTransferPendingMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      const { payee } = event;
      await handleNotificationForRecipients(event, payee.recipients, (ctx) =>
        buildTransferRejectedMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferStillPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await handleNotificationForRecipients(event, payer.recipients, (ctx) =>
        buildTransferStillPendingMessage(event, ctx)
      );
    }),

    // Post events
    eventBus.on(EVENT_NAME.NeedExpired, async (event: EnrichedPostEvent) => {
      await handleNotificationForRecipients(event, event.recipients, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.OfferExpired, async (event: EnrichedPostEvent) => {
      await handleNotificationForRecipients(event, event.recipients, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.PostExpiresSoon, async (event: EnrichedPostEvent) => {
      await handleNotificationForRecipients(event, event.recipients, (ctx) =>
        buildPostExpiresSoonMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.OfferPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await handleNotificationForRecipients(
        event,
        event.recipients,
        (ctx) => buildSinglePostPublishedMessage(event, post, member, ctx),
        true,
      );
    }),
    eventBus.on(EVENT_NAME.NeedPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await handleNotificationForRecipients(
        event,
        event.recipients,
        (ctx) => buildSinglePostPublishedMessage(event, post, member, ctx),
        true,
      );
    }),
    eventBus.on(EVENT_NAME.PostsPublishedDigest, async (event: EnrichedPostsPublishedDigestEvent) => {
      await handleNotificationForRecipients(
        event,
        event.recipients,
        (ctx) => buildPostsPublishedDigestMessage(event, ctx),
        true,
      );
    }),

    // Member events
    eventBus.on(EVENT_NAME.MemberHasExpiredPosts, async (event: EnrichedMemberHasExpiredPostsEvent) => {
      await handleNotificationForRecipients(event, event.recipients, (ctx) =>
        buildMemberHasExpiredPostsMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.MembersJoinedDigest, async (event: EnrichedMembersJoinedDigestEvent) => {
      await handleNotificationForRecipients(
        event,
        event.recipients,
        (ctx) => buildMembersJoinedDigestMessage(event, ctx),
        true,
      );
    }),
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => {
      await handleNotificationForRecipients(event, event.recipients, (ctx) =>
        buildMemberJoinedMessage(event, ctx)
      );
    }),

    // Engagement synthetic events
    eventBus.on(EVENT_NAME.MemberHasNoPosts, async (event: EnrichedMemberHasNoPostsEvent) => {
      await handleNotificationForRecipients(event, event.recipients, (ctx) =>
        buildMemberHasNoPostsMessage(event, ctx)
      );
    })
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};
