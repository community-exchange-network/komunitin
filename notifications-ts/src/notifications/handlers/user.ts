import { KomunitinClient } from "../../clients/komunitin/client";
import { getAuthCode } from "../../clients/komunitin/getAuthCode";
import { getCachedActiveGroups, getCachedGroup } from "../../utils/cached-resources";
import { EnrichedUserEvent } from "../enriched-events";
import { eventBus } from "../event-bus";
import { UserEvent } from "../events";

export const handleUserEvent = async (event: UserEvent) => {
  const client = new KomunitinClient();
  
  // These are auth-related events. We want to fetch user details and token and
  // emit them so that the email channel can include a magic link in the email.
  const user = await client.getUser(event.data.user);
  const settings = await client.getUserSettings(event.data.user);
  const token = await getAuthCode(event.data.user);

  const enrichedEvent: EnrichedUserEvent = {
    ...event,
    target: { user, settings },
    token
  };

  if (event.code) {
    const group = await getCachedGroup(client, event.code);
    enrichedEvent.group = group.data;
  }

  // Emit the enriched event for the email channel to consume
  await eventBus.emit(enrichedEvent);

}