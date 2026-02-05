import { KomunitinClient } from '../../clients/komunitin/client';
import { Member, User, UserSettings } from '../../clients/komunitin/types';
import { getCachedGroupMembersWithUsers } from '../../utils/cached-resources';
import { internalError } from '../../utils/error';
import logger from '../../utils/logger';
import { EnrichedPostEvent } from '../enriched-events';
import { eventBus } from '../event-bus';
import { EVENT_NAME, PostEvent } from '../events';

/**
 * Expiry window (created - expires in days) to consider a post as "urgent".
 */
export const POSTS_URGENT_DAYS = 7;

/**
 * Check if a post is urgent based on its expiry window.
 */
export const isPostUrgent = (post: { attributes: { expires: string; created: string } }): boolean => {
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
    throw internalError(`Missing member ${memberId} in post response for ${dataKey} ${postId}`);
  }

  // Fetch group
  const groupResponse = await client.getGroup(event.code);
  const group = groupResponse.data;

  const isPublishedEvent =
    event.name === EVENT_NAME.OfferPublished || event.name === EVENT_NAME.NeedPublished;
  let usersWithSettings: Array<{ user: any; settings: any }> = [];

  // For published events, fetch all member users; for others, just the post author.
  if (isPublishedEvent && isPostUrgent(post)) {
    const allMembersWithUsers = await getCachedGroupMembersWithUsers(client, event.code);
    const allUsersMap = allMembersWithUsers.reduce((map, mwu) => {
      mwu.users.forEach((r) => map.set(r.user.id, r));
      return map;
    }, new Map<string, { user: User; settings: UserSettings }>());
    usersWithSettings = Array.from(allUsersMap.values());
  } else {
    usersWithSettings = await client.getMemberUsers(memberId);
  }

  const enrichedEvent: EnrichedPostEvent = {
    ...event,
    group,
    post,
    postType: isOfferEvent ? 'offers' : 'needs',
    member,
    users: usersWithSettings,
  };

  logger.debug({ enrichedEvent }, 'Enriched post event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
