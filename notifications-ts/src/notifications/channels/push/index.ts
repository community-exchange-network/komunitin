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
  EnrichedAccountPostEvent,
  EnrichedTransferEvent,
  EnrichedPublishedPostEvent,
  EnrichedPostsPublishedDigestEvent,
  EnrichedMemberHasExpiredPostsEvent,
  EnrichedMembersJoinedDigestEvent,
  EnrichedMemberEvent,
  EnrichedMemberHasNoPostsEvent,
} from '../../enriched-events';
import {
  initPushQueue,
  sendPushToAccountRecipients,
  sendPushToGroupRecipients,
} from './utils';

export const initPushChannel = (): (() => void) => {
  logger.info('Initializing push notification channel');

  const stopPushQueue = initPushQueue();
  // Subscribe to events and collect unsubscribe functions
  const unsubscribers = [
    // Transfer events
    eventBus.on(EVENT_NAME.TransferCommitted, async (event: EnrichedTransferEvent) => {
      const { payer, payee } = event;
      await sendPushToAccountRecipients(event, payer.recipients, buildTransferSentMessage);
      await sendPushToAccountRecipients(event, payee.recipients, buildTransferReceivedMessage);
    }),
    eventBus.on(EVENT_NAME.TransferPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToAccountRecipients(event, payer.recipients, buildTransferPendingMessage, 'high');
    }),
    eventBus.on(EVENT_NAME.TransferRejected, async (event: EnrichedTransferEvent) => {
      const { payee } = event;
      await sendPushToAccountRecipients(event, payee.recipients, buildTransferRejectedMessage, 'high');
    }),
    eventBus.on(EVENT_NAME.TransferStillPending, async (event: EnrichedTransferEvent) => {
      const { payer } = event;
      await sendPushToAccountRecipients(event, payer.recipients, buildTransferStillPendingMessage);
    }),

    // Post events
    eventBus.on(EVENT_NAME.NeedExpired, async (event: EnrichedAccountPostEvent) => {
      await sendPushToAccountRecipients(event, event.recipients, buildPostExpiredMessage);
    }),
    eventBus.on(EVENT_NAME.OfferExpired, async (event: EnrichedAccountPostEvent) => {
      await sendPushToAccountRecipients(event, event.recipients, buildPostExpiredMessage);
    }),
    eventBus.on(EVENT_NAME.PostExpiresSoon, async (event: EnrichedAccountPostEvent) => {
      await sendPushToAccountRecipients(event, event.recipients, buildPostExpiresSoonMessage);
    }),
    eventBus.on(EVENT_NAME.OfferPublished, async (event: EnrichedPublishedPostEvent) => {
      const { post, member } = event;
      await sendPushToGroupRecipients(event, event.recipients,
        (event, ctx) => buildSinglePostPublishedMessage(event, post, member, ctx));
    }),
    eventBus.on(EVENT_NAME.NeedPublished, async (event: EnrichedPublishedPostEvent) => {
      const { post, member } = event;
      await sendPushToGroupRecipients(event, event.recipients,
        (event, ctx) => buildSinglePostPublishedMessage(event, post, member, ctx));
    }),
    eventBus.on(EVENT_NAME.PostsPublishedDigest, async (event: EnrichedPostsPublishedDigestEvent) => {
      await sendPushToGroupRecipients(event, event.recipients, buildPostsPublishedDigestMessage);
    }),

    // Member events
    eventBus.on(EVENT_NAME.MemberHasExpiredPosts, async (event: EnrichedMemberHasExpiredPostsEvent) => {
      await sendPushToAccountRecipients(event, event.recipients, buildMemberHasExpiredPostsMessage);
    }),
    eventBus.on(EVENT_NAME.MembersJoinedDigest, async (event: EnrichedMembersJoinedDigestEvent) => {
      await sendPushToGroupRecipients(event, event.recipients, buildMembersJoinedDigestMessage);
    }),
    eventBus.on(EVENT_NAME.MemberJoined, async (event: EnrichedMemberEvent) => {
      await sendPushToAccountRecipients(event, event.recipients, buildMemberJoinedMessage);
    }),

    // Engagement synthetic events
    eventBus.on(EVENT_NAME.MemberHasNoPosts, async (event: EnrichedMemberHasNoPostsEvent) => {
      await sendPushToAccountRecipients(event, event.recipients, buildMemberHasNoPostsMessage);
    })
  ];

  // Return stop function that unsubscribes all listeners
  return () => {
    unsubscribers.forEach(unsub => unsub());
    stopPushQueue();
  };
};
