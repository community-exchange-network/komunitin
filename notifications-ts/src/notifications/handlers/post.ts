import { PostEvent, EVENT_NAME } from '../events';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Member } from '../../clients/komunitin/types';
import logger from '../../utils/logger';
import { eventBus } from '../event-bus';
import { EnrichedPostEvent } from '../enriched-events';
import { internalError } from '../../utils/error';
import { setTimeout as delay } from 'timers/promises';

const URGENT_POST_DAYS = 7;
const FETCH_DELAY_MS = 50;

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

  if (isPublishedEvent) {
    const created = new Date(post.attributes.created);
    const expires = new Date(post.attributes.expires);
    const windowDays = (expires.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

    if (windowDays <= URGENT_POST_DAYS) {
      logger.info({ postId, windowDays }, 'Urgent post detected, fetching all group users');
      const members = await client.getMembers(event.code);
      const allUsersMap = new Map<string, { user: any; settings: any }>();

      for (const m of members) {
        await delay(FETCH_DELAY_MS);
        const memberUsers = await client.getMemberUsers(m.id);
        memberUsers.forEach((r) => allUsersMap.set(r.user.id, r));
      }
      usersWithSettings = Array.from(allUsersMap.values());
    } else {
      logger.info({ postId, windowDays }, 'Post is not urgent, skipping group notification');
    }
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
