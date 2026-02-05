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
import { initPushQueue, sendPushToUsers } from './utils';

export const initPushChannel = (): (() => void) => {
  logger.info('Initializing push notification channel');

  const stopPushQueue = initPushQueue();
  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      const { payer, payee } = event;
      await sendPushToUsers(event, payer.users, (ctx) => 
        buildTransferSentMessage(event, ctx)
      , 'account');
      await sendPushToUsers(event, payee.users, (ctx) => 
        buildTransferReceivedMessage(event, ctx)
      , 'account');
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToUsers(event, payer.users, (ctx) =>
        buildTransferPendingMessage(event, ctx)
      , 'account', 'high');
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      const { payee } = event;
      await sendPushToUsers(event, payee.users, (ctx) =>
        buildTransferRejectedMessage(event, ctx)
      , 'account', 'high');
    }),
    eventBus.on(EVENT_NAME.TransferStillPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToUsers(event, payer.users, (ctx) =>
        buildTransferStillPendingMessage(event, ctx)
      , 'account');
    }),

    // Post events
    eventBus.on(EVENT_NAME.NeedExpired, async (event: EnrichedPostEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      , 'account');
    }),
    eventBus.on(EVENT_NAME.OfferExpired, async (event: EnrichedPostEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostExpiredMessage(event, ctx)
      , 'account');
    }),
    eventBus.on(EVENT_NAME.PostExpiresSoon, async (event: EnrichedPostEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostExpiresSoonMessage(event, ctx)
      , 'account');
    }),
    eventBus.on(EVENT_NAME.OfferPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await sendPushToUsers(event, event.users, (ctx) =>
        buildSinglePostPublishedMessage(event, post, member, ctx)
      , 'group');
    }),
    eventBus.on(EVENT_NAME.NeedPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await sendPushToUsers(event, event.users, (ctx) =>
        buildSinglePostPublishedMessage(event, post, member, ctx)
      , 'group');
    }),
    eventBus.on(EVENT_NAME.PostsPublishedDigest, async (event: EnrichedPostsPublishedDigestEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildPostsPublishedDigestMessage(event, ctx)
      , 'group');
    }),

    // Member events
    eventBus.on(EVENT_NAME.MemberHasExpiredPosts, async (event: EnrichedMemberHasExpiredPostsEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildMemberHasExpiredPostsMessage(event, ctx)
      , 'group');
    }),
    eventBus.on(EVENT_NAME.MembersJoinedDigest, async (event: EnrichedMembersJoinedDigestEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildMembersJoinedDigestMessage(event, ctx)
      , 'group');
    }),
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildMemberJoinedMessage(event, ctx)
      , 'account');
    }),

    // Engagement synthetic events
    eventBus.on(EVENT_NAME.MemberHasNoPosts, async (event: EnrichedMemberHasNoPostsEvent) => {
      await sendPushToUsers(event, event.users, (ctx) =>
        buildMemberHasNoPostsMessage(event, ctx)
      , 'account');
    })
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
    stopPushQueue();
  };
};

