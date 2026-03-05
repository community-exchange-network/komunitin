import { KomunitinClient } from '../../clients/komunitin/client';
import logger from '../../utils/logger';
import { EnrichedGroupEvent } from '../enriched-events';
import { eventBus } from '../event-bus';
import { GroupEvent } from '../events';

export const handleGroupEvent = async (event: GroupEvent): Promise<void> => {
  logger.info({ event }, 'Handling group event');

  const client = new KomunitinClient();

  // Fetch group
  const groupResponse = await client.getGroup(event.code);
  const group = groupResponse.data;

  // Fetch admin users with settings in parallel
  const adminUserIds = group.relationships.admins.data.map(admin => admin.id);
  const adminUsers = await Promise.all(
    adminUserIds.map(id => client.getUserWithSettings(id))
  );

  const enrichedEvent: EnrichedGroupEvent = {
    ...event,
    group,
    adminUsers,
  };

  logger.info({ enrichedEvent }, 'Enriched group event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
