import { EVENT_NAME, MemberEvent } from '../events';
import { KomunitinClient } from '../../clients/komunitin/client';
import logger from '../../utils/logger';
import { eventBus } from '../event-bus';
import { EnrichedMemberEvent, EnrichedMemberHasExpiredPostsEvent, EnrichedMemberRequestedEvent } from '../enriched-events';

export const handleMemberEvent = async (event: MemberEvent): Promise<void> => {
  logger.info({ event }, 'Handling member event');

  const client = new KomunitinClient();
  const memberId = event.data.member;

  if (!memberId) {
    throw new Error(`Missing member id in member event ${event.name}`);
  }

  // Fetch member, users, and group in parallel
  const [member, usersWithSettings, groupResponse] = await Promise.all([
    client.getMember(event.code, memberId),
    client.getMemberUsers(memberId),
    client.getGroup(event.code),
  ]);

  const group = groupResponse.data;

  const enrichedEvent: EnrichedMemberEvent = {
    ...event,
    group,
    member,
    users: usersWithSettings,
  };

  // For MemberRequested, fetch admin users with settings
  if (event.name === EVENT_NAME.MemberRequested) {
    const adminUserIds = group.relationships.admins.data.map(admin => admin.id);
    const adminUsers = await Promise.all(
      adminUserIds.map(id => client.getUserWithSettings(id))
    );
    (enrichedEvent as EnrichedMemberRequestedEvent).adminUsers = adminUsers;
  }

  // Fetch expired offers and needs if applicable
  if (event.name === EVENT_NAME.MemberHasExpiredPosts) {
    const [expiredOffers, expiredNeeds] = await Promise.all([
      client.getOffers(event.code, { "filter[member]": memberId, "filter[expired]": "true" }),
      client.getNeeds(event.code, { "filter[member]": memberId, "filter[expired]": "true" }),
    ]);
    const enrichedMemberHasExpiredPostsEvent = enrichedEvent as EnrichedMemberHasExpiredPostsEvent;
    enrichedMemberHasExpiredPostsEvent.expiredOffers = expiredOffers;
    enrichedMemberHasExpiredPostsEvent.expiredNeeds = expiredNeeds;
  }

  logger.debug({ enrichedEvent }, 'Enriched member event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
