import { KomunitinClient } from '../../clients/komunitin/client';
import { User } from '../../clients/komunitin/types';
import logger from '../../utils/logger';
import { EnrichedGroupEvent } from '../enriched-events';
import { eventBus } from '../event-bus';
import { GroupEvent } from '../events';

export const handleGroupEvent = async (event: GroupEvent): Promise<void> => {
  logger.info({ event }, 'Handling group event');

  const client = new KomunitinClient();

  // Fetch group with included admins
  const groupResponse = await client.getGroup(event.code, ['admins']);
  const group = groupResponse.data;
  const included = groupResponse.included || [];

  // Extract admin users from included resources
  const adminUserIds = group.relationships.admins.data.map(admin => admin.id);
  const adminUsersData = included.filter((r: any) => r.type === 'users' && adminUserIds.includes(r.id)) as User[];

  // Fetch settings for all admin users in parallel
  const allSettings = await Promise.all(
    adminUsersData.map(user => client.getUserSettings(user.id))
  );
  const settingsMap = new Map(adminUsersData.map((user, i) => [user.id, allSettings[i]]));

  const adminUsers = adminUsersData.map(user => ({ user, settings: settingsMap.get(user.id)! }));

  const enrichedEvent: EnrichedGroupEvent = {
    ...event,
    group,
    adminUsers,
  };

  logger.info({ enrichedEvent }, 'Enriched group event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
