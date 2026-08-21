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
import { initPushQueue, sendPushToRecipients } from './utils';

export const initPushChannel = (): (() => void) => {
  logger.info('Initializing push notification channel');

  const stopPushQueue = initPushQueue();
  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      const { payer, payee } = event;
      await sendPushToRecipients(event, payer.recipients, buildTransferSentMessage, 'account');
      await sendPushToRecipients(event, payee.recipients, buildTransferReceivedMessage, 'account');
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToRecipients(event, payer.recipients, buildTransferPendingMessage, 'account', 'high');
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      const { payee } = event;
      await sendPushToRecipients(event, payee.recipients, buildTransferRejectedMessage, 'account', 'high');
    }),
    eventBus.on(EVENT_NAME.TransferStillPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToRecipients(event, payer.recipients, buildTransferStillPendingMessage, 'account');
    }),

    // Post events
    eventBus.on(EVENT_NAME.NeedExpired, async (event: EnrichedPostEvent) => {
      await sendPushToRecipients(event, event.recipients, buildPostExpiredMessage, 'account');
    }),
    eventBus.on(EVENT_NAME.OfferExpired, async (event: EnrichedPostEvent) => {
      await sendPushToRecipients(event, event.recipients, buildPostExpiredMessage, 'account');
    }),
    eventBus.on(EVENT_NAME.PostExpiresSoon, async (event: EnrichedPostEvent) => {
      await sendPushToRecipients(event, event.recipients, buildPostExpiresSoonMessage, 'account');
    }),
    eventBus.on(EVENT_NAME.OfferPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await sendPushToRecipients(event, event.recipients,
        (event, ctx) => buildSinglePostPublishedMessage(event, post, member, ctx),
        'group');
    }),
    eventBus.on(EVENT_NAME.NeedPublished, async (event: EnrichedPostEvent) => {
      const { post, member } = event;
      await sendPushToRecipients(event, event.recipients,
        (event, ctx) => buildSinglePostPublishedMessage(event, post, member, ctx),
        'group');
    }),
    eventBus.on(EVENT_NAME.PostsPublishedDigest, async (event: EnrichedPostsPublishedDigestEvent) => {
      await sendPushToRecipients(event, event.recipients, buildPostsPublishedDigestMessage, 'group');
    }),

    // Member events
    eventBus.on(EVENT_NAME.MemberHasExpiredPosts, async (event: EnrichedMemberHasExpiredPostsEvent) => {
      await sendPushToRecipients(event, event.recipients, buildMemberHasExpiredPostsMessage, 'account');
    }),
    eventBus.on(EVENT_NAME.MembersJoinedDigest, async (event: EnrichedMembersJoinedDigestEvent) => {
      await sendPushToRecipients(event, event.recipients, buildMembersJoinedDigestMessage, 'group');
    }),
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => {
      await sendPushToRecipients(event, event.recipients, buildMemberJoinedMessage, 'account');
    }),

    // Engagement synthetic events
    eventBus.on(EVENT_NAME.MemberHasNoPosts, async (event: EnrichedMemberHasNoPostsEvent) => {
      await sendPushToRecipients(event, event.recipients, buildMemberHasNoPostsMessage, 'account');
    })
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
    stopPushQueue();
  };
};
