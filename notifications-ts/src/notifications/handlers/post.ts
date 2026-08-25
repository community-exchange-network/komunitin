import { KomunitinClient } from '../../clients/komunitin/client';
import { hasExpiration } from '../../clients/komunitin/post';
import { Member, Post } from '../../clients/komunitin/types';
import { groupRecipients, memberRecipients } from '../../clients/komunitin/recipients';
import { internalError } from '../../utils/error';
import logger from '../../utils/logger';
import {
  EnrichedAccountPostEvent,
  EnrichedPostEvent,
  EnrichedPublishedPostEvent,
} from '../enriched-events';
import { eventBus } from '../event-bus';
import { EVENT_NAME, PostEvent } from '../events';

type EnrichedPostRecipients =
  | Pick<EnrichedPublishedPostEvent, 'name' | 'recipients'>
  | Pick<EnrichedAccountPostEvent, 'name' | 'recipients'>;

/**
 * Expiry window (created - expires in days) to consider a post as "urgent".
 */
export const POSTS_URGENT_DAYS = 7;

/**
 * Check if a post is urgent based on its expiry window.
 */
export const isPostUrgent = (post: Post): boolean => {
  if (!hasExpiration(post)) {
    return false;
  }
  const expire = new Date(post.attributes.expires);
  const created = new Date(post.attributes.created);
  const windowDays = (expire.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return windowDays <= POSTS_URGENT_DAYS;
};

export const handlePostEvent = async (event: PostEvent): Promise<void> => {
  logger.info({ event }, 'Handling post event');

  const client = new KomunitinClient();

  // Determine if it's an offer or need event
  const isOfferEvent =
    event.name === EVENT_NAME.OfferPublished ||
    event.name === EVENT_NAME.OfferExpired ||
    !!event.data.offer;
  const dataKey = isOfferEvent ? 'offer' : 'need';
  const postId = event.data[dataKey];

  if (!postId) {
    throw new Error(`Missing ${dataKey} id in post event ${event.name}`);
  }

  // Fetch the post with its included member
  const postResponse = await client.getPost(event.code, postId, ['member']);

  const post = postResponse.data;
  const included = postResponse.included || [];

  // Extract member from included resources
  const memberId = post.relationships.member.data.id;
  const member = included.find((r: any) => r.type === 'members' && r.id === memberId) as Member;

  if (!member) {
    throw internalError(`Missing member ${memberId} in post response for ${dataKey} ${postId}`);
  }

  if (member.attributes.status !== 'active') {
    logger.info({
      eventName: event.name,
      memberId,
      memberStatus: member.attributes.status,
      postId,
    }, 'Skipping post event from inactive member');
    return;
  }

  // Fetch group
  const groupResponse = await client.getGroup(event.code);
  const group = groupResponse.data;

  const eventName = event.name;
  let recipientData: EnrichedPostRecipients;

  if (eventName === EVENT_NAME.OfferPublished || eventName === EVENT_NAME.NeedPublished) {
    // Urgent posts notify the whole group; regular posts only confirm publication to the author.
    const relations = isPostUrgent(post)
      ? await client.getMemberUsers(event.code, { memberStatus: 'active' })
      : await client.getMemberUsers(event.code, { member: memberId });
    recipientData = {
      name: eventName,
      recipients: groupRecipients(relations),
    };
  } else {
    recipientData = {
      name: eventName,
      recipients: memberRecipients(await client.getMemberUsers(event.code, { member: memberId })),
    };
  }

  const enrichedEvent = {
    ...event,
    ...recipientData,
    group,
    post,
    postType: isOfferEvent ? 'offers' : 'needs',
    member,
  } satisfies EnrichedPostEvent;

  logger.debug({ enrichedEvent }, 'Enriched post event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
