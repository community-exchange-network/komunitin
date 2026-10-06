import { KomunitinClient } from "../../clients/komunitin/client";
import { getActionToken, type ActionTokenRequest } from "../../clients/komunitin/getActionToken";
import { getCachedGroup } from "../../utils/cached-resources";
import { EnrichedUserEvent } from "../enriched-events";
import { eventBus } from "../event-bus";
import { EVENT_NAME, UserEvent } from "../events";

export const handleUserEvent = async (event: UserEvent) => {
  const action: ActionTokenRequest = event.name === EVENT_NAME.PasswordResetRequested
    ? { purpose: 'passwordReset' }
    : event.name === EVENT_NAME.MemberDeletionRequested
      ? {
          purpose: 'memberDeletion',
          memberId: event.data.memberId,
        }
      : event.data.purpose === 'emailChange'
        ? { purpose: 'emailChange', email: event.data.email }
        : { purpose: 'emailVerification', signup: event.data.signup };
  const { token, email } = await getActionToken(event.data.user, action);

  const client = new KomunitinClient();

  // Use Object.assign to satisfy type check.
  const enrichedEvent: EnrichedUserEvent = Object.assign({}, event, {
    token,
    data: { ...event.data, email },
  })

  if (event.name === EVENT_NAME.MemberDeletionRequested) {
    enrichedEvent.member = await client.getMember(event.code, event.data.memberId);
  }

  if (event.code) {
    const group = await getCachedGroup(client, event.code);
    enrichedEvent.group = group.data;
  }

  // Emit the enriched event for the email channel to consume
  await eventBus.emit(enrichedEvent);
}
