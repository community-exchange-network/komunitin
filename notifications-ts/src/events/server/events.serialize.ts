import type { AnyNotificationEvent } from "../../notifications/events";

export const serializeEvent = (event: AnyNotificationEvent) => {
  return {
    type: 'events',
    id: event.id,
    attributes: {
      name: event.name,
      source: event.source,
      code: event.code,
      time: event.time.toISOString(),
      data: event.data,
    },
    relationships: {
      user: {
        data: {
          type: 'users',
          id: event.user,
        },
      },
    },
  };
};
