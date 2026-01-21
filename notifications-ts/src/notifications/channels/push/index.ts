import { eventBus } from '../../event-bus';
import { EVENT_NAME } from '../../events';
import logger from '../../../utils/logger';
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
} from '../../messages';
import {
  EnrichedTransferEvent,
  EnrichedPostEvent,
  EnrichedPostsPublishedDigestEvent,
  EnrichedMemberHasExpiredPostsEvent,
  EnrichedMembersJoinedDigestEvent,
} from '../../enriched-events';
import { sendPushToUsers } from './utils';

export const initPushChannel = (): (() => void) => {
  logger.info('Initializing push notification channel');

  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      const { payer, payee } = event;
      await sendPushToUsers(event, payer.users, (ctx) => 
        buildTransferSentMessage(event, ctx)
      );
      await sendPushToUsers(event, payee.users, (ctx) => 
        buildTransferReceivedMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToUsers(event, payer.users, (ctx) =>
        buildTransferPendingMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      const { payee } = event;
      await sendPushToUsers(event, payee.users, (ctx) =>
        buildTransferRejectedMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.TransferStillPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToUsers(event, payer.users, (ctx) =>
        buildTransferStillPendingMessage(event, ctx)
      );
    }),

    // Post events
    eventBus.on(EVENT_NAME.NeedExpired, async (event: EnrichedPostEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.OfferExpired, async (event: EnrichedPostEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.PostExpiresSoon, async (event: EnrichedPostEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostExpiresSoonMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.OfferPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await sendPushToUsers(event, event.users, (ctx) =>
        buildSinglePostPublishedMessage(event, post, member, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.NeedPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await sendPushToUsers(event, event.users, (ctx) =>
        buildSinglePostPublishedMessage(event, post, member, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.PostsPublishedDigest, async (event: EnrichedPostsPublishedDigestEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostsPublishedDigestMessage(event, ctx)
      );
    }),

    // Member events
    eventBus.on(EVENT_NAME.MemberHasExpiredPosts, async (event: EnrichedMemberHasExpiredPostsEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildMemberHasExpiredPostsMessage(event, ctx)
      );
    }),
    eventBus.on(EVENT_NAME.MembersJoinedDigest, async (event: EnrichedMembersJoinedDigestEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildMembersJoinedDigestMessage(event, ctx)
      );
    }),
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
};

