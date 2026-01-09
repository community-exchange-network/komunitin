import { PostEvent, EVENT_NAME } from '../events';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Member } from '../../clients/komunitin/types';
import logger from '../../utils/logger';
import { eventBus } from '../event-bus';
import { EnrichedPostEvent } from '../enriched-events';

export const handlePostEvent = async (event: PostEvent): Promise<void> => {
  logger.info({ event }, 'Handling post event');

  const client = new KomunitinClient();

  // Determine if it's an offer or need event
  const isOfferEvent = event.name === EVENT_NAME.OfferPublished || event.name === EVENT_NAME.OfferExpired;
  const postType: 'offer' | 'need' = isOfferEvent ? 'offer' : 'need';
  const postId = event.data[postType];

  if (!postId) {
    throw new Error(`Missing ${postType} id in post event ${event.name}`);
  }

  // Fetch the post (offer or need) with included member
  const postResponse = isOfferEvent
    ? await client.getOffer(event.code, postId, ['member'])
    : await client.getNeed(event.code, postId, ['member']);
  
  const post = postResponse.data;
  const included = postResponse.included || [];

  // Extract member from included resources
  const memberId = post.relationships.member.data.id;
  const member = included.find((r: any) => r.type === 'members' && r.id === memberId) as Member;

  if (!member) {
    throw new Error(`Missing member ${memberId} in post response for ${postType} ${postId}`);
  }

  // Fetch users and group in parallel
  const [usersWithSettings, groupResponse] = await Promise.all([
    client.getMemberUsers(memberId),
    client.getGroup(event.code),
  ]);

  const group = groupResponse.data;

  const enrichedEvent: EnrichedPostEvent = {
    ...event,
    group,
    post,
    postType,
    member,
    users: usersWithSettings,
  };

  logger.info({ enrichedEvent }, 'Enriched post event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
