import { EVENT_NAME, MemberEvent } from '../events';
import { KomunitinClient } from '../../clients/komunitin/client';
import logger from '../../utils/logger';
import { eventBus } from '../event-bus';
import { EnrichedMemberEvent, EnrichedMemberHasExpiredPostsEvent, EnrichedMemberRequestedEvent } from '../enriched-events';
import { mandatoryRecipients, memberRecipients } from '../../clients/komunitin/recipients';
import { internalError } from '../../utils/error';

export const handleMemberEvent = async (event: MemberEvent): Promise<void> => {
  logger.info({ event }, 'Handling member event');

  const client = new KomunitinClient();
  const memberId = event.data.member;

  if (!memberId) {
    throw new Error(`Missing member id in member event ${event.name}`);
  }

  // Fetch member-user resources and group in parallel.
  const [relations, groupResponse] = await Promise.all([
    client.getMemberUsers(event.code, { member: memberId }),
    client.getGroup(event.code),
  ]);

  const member = relations[0]?.member;
  if (!member) {
    throw internalError(`Missing member-user resources for member ${memberId}`);
  }
  const group = groupResponse.data;

  const enrichedEvent: EnrichedMemberEvent = {
    ...event,
    group,
    member,
    recipients: memberRecipients(relations),
  };

  // Administrative-duty messages are mandatory and do not need preferences.
  if (event.name === EVENT_NAME.MemberRequested) {
    const admins = await client.getGroupAdmins(event.code);
    (enrichedEvent as EnrichedMemberRequestedEvent).adminRecipients = mandatoryRecipients(admins);
  }

  // Fetch expired offers and needs if applicable
  if (
    event.name === EVENT_NAME.MemberHasExpiredPosts
    || event.name === EVENT_NAME.MemberHasExpiredPostsRecently
  ) {
    const [expiredOffers, expiredNeeds] = await Promise.all([
      client.getOffers(event.code, {
        "filter[member]": memberId,
        "filter[status]": "published",
        "filter[expired]": "true"
      }),
      client.getNeeds(event.code, {
        "filter[member]": memberId,
        "filter[status]": "published",
        "filter[expired]": "true"
      }),
    ]);
    const enrichedMemberHasExpiredPostsEvent = enrichedEvent as EnrichedMemberHasExpiredPostsEvent;
    enrichedMemberHasExpiredPostsEvent.expiredOffers = expiredOffers;
    enrichedMemberHasExpiredPostsEvent.expiredNeeds = expiredNeeds;
  }

  logger.debug({ enrichedEvent }, 'Enriched member event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
