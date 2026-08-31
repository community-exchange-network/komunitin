import { KomunitinClient } from '../../clients/komunitin/client';
import logger from '../../utils/logger';
import { EnrichedGroupEvent } from '../enriched-events';
import { eventBus } from '../event-bus';
import { GroupEvent } from '../events';
import { mandatoryRecipients } from '../../clients/komunitin/recipients';

export const handleGroupEvent = async (event: GroupEvent): Promise<void> => {
  logger.info({ event }, 'Handling group event');

  const client = new KomunitinClient();

  // Fetch group
  const groupResponse = await client.getGroup(event.code);
  const group = groupResponse.data;

  // Administrative-duty messages are mandatory and do not need preferences.
  const admins = await client.getGroupAdmins(event.code);

  const enrichedEvent: EnrichedGroupEvent = {
    ...event,
    group,
    adminRecipients: mandatoryRecipients(admins),
  };

  logger.info({ enrichedEvent }, 'Enriched group event');

  // Emit to event bus for channels to handle
  await eventBus.emit(enrichedEvent);
};
