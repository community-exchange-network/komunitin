import { MemberEvent } from '../events';
import { KomunitinClient } from '../../clients/komunitin/client';
import { Member, User, Group, UserSettings } from '../../clients/komunitin/types';
import logger from '../../utils/logger';
import { eventBus } from '../event-bus';
import { EnrichedMemberEvent } from '../enriched-events';

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

  logger.info({ enrichedEvent }, 'Enriched member event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
