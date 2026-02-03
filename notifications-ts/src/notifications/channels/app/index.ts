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
} from '../../messages';
import {
  EnrichedTransferEvent,
  EnrichedPostEvent,
  EnrichedPostsPublishedDigestEvent,
  EnrichedMemberHasExpiredPostsEvent,
  EnrichedMembersJoinedDigestEvent,
  EnrichedMemberEvent,
} from '../../enriched-events';
import { handleNotificationForUsers } from './utils';

export const initInAppChannel = (): (() => void) => {
  logger.info('Initializing in-app notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      const { payer, payee } = event;
      await handleNotificationForUsers(event, payer.users, (ctx) => 
        buildTransferSentMessage(event, ctx)
      );
      await handleNotificationForUsers(event, payee.users, (ctx) => 
        buildTransferReceivedMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await handleNotificationForUsers(event, payer.users, (ctx) =>
        buildTransferPendingMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      const { payee } = event;
      await handleNotificationForUsers(event, payee.users, (ctx) =>
        buildTransferRejectedMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferStillPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await handleNotificationForUsers(event, payer.users, (ctx) =>
        buildTransferStillPendingMessage(event, ctx)
      );
    }),

    // Post events
    eventBus.on(EVENT_NAME.NeedExpired, async (event: EnrichedPostEvent) => {
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.OfferExpired, async (event: EnrichedPostEvent) => {
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.PostExpiresSoon, async (event: EnrichedPostEvent) => {
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildPostExpiresSoonMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.OfferPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildSinglePostPublishedMessage(event, post, member, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.NeedPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildSinglePostPublishedMessage(event, post, member, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.PostsPublishedDigest, async (event: EnrichedPostsPublishedDigestEvent) => {
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildPostsPublishedDigestMessage(event, ctx)
      );
    }),

    // Member events
    eventBus.on(EVENT_NAME.MemberHasExpiredPosts, async (event: EnrichedMemberHasExpiredPostsEvent) => {
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildMemberHasExpiredPostsMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.MembersJoinedDigest, async (event: EnrichedMembersJoinedDigestEvent) => {
      await handleNotificationForUsers(event, event.users, (ctx) =>
        buildMembersJoinedDigestMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => {
      await handleNotificationForUsers(event, event.users, (ctx) => 
        buildMemberJoinedMessage(event, ctx)
      );
    })
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};

