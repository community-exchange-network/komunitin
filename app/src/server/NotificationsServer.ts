import type { Server} from "miragejs";
import { Response } from "miragejs";
import { config } from "src/utils/config";
import faker from "faker";

const urlNotifications = config.NOTIFICATIONS_URL;

// In-memory store for notification seed data, keyed by group code.
const notificationsByGroup: Record<string, Array<{
  id: string;
  title: string;
  body: string;
  image: string | null;
  read: string | null;
  created: string;
  data: Record<string, unknown> | null;
}>> = {};

function seedNotifications(groupCode: string) {
  const notifications = [];
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    notifications.push({
      id: faker.random.uuid(),
      title: faker.lorem.sentence(),
      body: faker.lorem.sentences(2),
      image: i % 3 === 0 ? faker.image.avatar() : null,
      // First 3 are unread, last 2 are read.
      read: i >= 3 ? new Date(now - i * 3600 * 1000).toISOString() : null,
      created: new Date(now - i * 86400 * 1000).toISOString(),
      data: i % 2 === 0 ? { route: "/home" } : null,
    });
  }
  notificationsByGroup[groupCode] = notifications;
  return notifications;
}

function getNotifications(groupCode: string) {
  return notificationsByGroup[groupCode] ?? seedNotifications(groupCode);
}

function toJsonApi(notification: typeof notificationsByGroup[string][number]) {
  return {
    type: "notifications",
    id: notification.id,
    attributes: {
      title: notification.title,
      body: notification.body,
      image: notification.image,
      read: notification.read,
      created: notification.created,
      data: notification.data,
    },
  };
}

/**
 * Object containing the properties to create a MirageJS server that mocks the
 * Komunitin Notifications API.
 */
export default {
  routes(server: Server) {
    // Subscribe to push notifications.
    server.post(
      urlNotifications + "/subscriptions",
      (_schema, request) => {
        return new Response(201, {}, request.requestBody);
      }
    );

    // Delete subscription.
    server.delete(urlNotifications + "/:code/subscriptions/:id", () => {
      return new Response(204);
    });

    // List notifications for a group (with meta.unread).
    server.get(urlNotifications + "/:code/notifications", (_schema, request) => {
      const groupCode = request.params.code;
      const notifications = getNotifications(groupCode);
      const unread = notifications.filter(n => n.read === null).length;

      // Respect page[size] if provided.
      const pageSize = request.queryParams["page[size]"]
        ? parseInt(String(request.queryParams["page[size]"]))
        : 20;
      const page = notifications.slice(0, pageSize);

      return new Response(200, {}, {
        data: page.map(toJsonApi),
        meta: {
          count: notifications.length,
          unread,
        },
        links: {
          next: null,
          prev: null,
        },
      });
    });

    // Mark all notifications as read.
    server.post(urlNotifications + "/:code/notifications/read", (_schema, request) => {
      const groupCode = request.params.code;
      const notifications = getNotifications(groupCode);
      const now = new Date().toISOString();
      notifications.forEach(n => {
        if (n.read === null) {
          n.read = now;
        }
      });
      return new Response(204);
    });

    // PATCH push notification telemetry.
    server.patch(urlNotifications + "/:code/push-notifications/:id", (_schema, request) => {
      return new Response(200, {}, request.requestBody);
    });
  }
}