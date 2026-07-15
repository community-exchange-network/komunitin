import { KomunitinClient } from "../../clients/komunitin/client";
import { getActionToken, type ActionTokenRequest } from "../../clients/komunitin/getActionToken";
import { getCachedGroup } from "../../utils/cached-resources";
import { EnrichedUserEvent } from "../enriched-events";
import { eventBus } from "../event-bus";
import { EVENT_NAME, UserEvent } from "../events";

export const handleUserEvent = async (event: UserEvent) => {
  const action: ActionTokenRequest = event.name === EVENT_NAME.PasswordResetRequested
    ? { purpose: 'passwordReset' }
    : event.data.purpose === 'emailChange'
      ? { purpose: 'emailChange', email: event.data.email }
      : { purpose: 'emailVerification', signup: event.data.signup };
  const token = await getActionToken(event.data.user, action);

  const enrichedEvent: EnrichedUserEvent = {
    ...event,
    token,
  };

  if (event.code) {
    const client = new KomunitinClient();
    const group = await getCachedGroup(client, event.code);
    enrichedEvent.group = group.data;
  }

  // Emit the enriched event for the email channel to consume
  await eventBus.emit(enrichedEvent);
}
