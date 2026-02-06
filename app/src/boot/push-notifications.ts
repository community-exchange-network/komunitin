import { Notify } from "quasar";
import { boot } from "quasar/wrappers";
import store from "src/store";
import { config } from "src/utils/config";
import { getActionRoute, type NotificationData, type PushPayload } from "src/utils/push-notifications";
import type { Router } from "vue-router";
import { i18n } from "./i18n";

/**
 * Boot file to handle incoming push messages from the service worker when the app is in the foreground. 
 * It receives messages via the Service Worker postMessage API and displays them as in-app notifications
 * using Quasar's Notify plugin.
 */
export default boot(({ router }) => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "PUSH_MESSAGE_RECEIVED") {
      handlePushMessage(event.data.payload, store, router);
    }
  });

  // When the app returns to the foreground, refresh the unread count.
  // This handles the case where push notifications arrived while the app was
  // in a background tab (OS notifications shown by the SW instead).
  let lastUnreadCountUpdate = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastUnreadCountUpdate > 30000) {
      lastUnreadCountUpdate = Date.now();
      store.dispatch("notifications/updateUnreadCount")
        .catch(e => console.warn("Failed to refresh unread count", e));
    }
  });
});

type StoreType = typeof store

/**
 * Send a PATCH to update push notification telemetry on the notifications service.
 * This mirrors what the service worker does for background notifications,
 * but for foreground (in-app) notifications.
 */
const patchPushNotification = async (
  code: string,
  id: string,
  attributes: Record<string, unknown>
): Promise<void> => {
  const url = `${config.NOTIFICATIONS_URL}/${code}/push-notifications/${id}`
  try {
    await fetch(url, {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
      body: JSON.stringify({
        data: {
          type: "push-notifications",
          id,
          attributes,
        },
      }),
    });
  } catch (err) {
    console.error("Failed to update notification event", err)
  }
};

/**
 * Handle user interaction with a foreground push notification.
 * Reports the click to the backend and optimistically decrements the unread count.
 */
const onNotificationInteraction = (
  code: string,
  id: string,
  clickaction: string,
): void => {
  store.commit("notifications/decrementUnreadCount");
  patchPushNotification(code, id, { clicked: true, clickaction });
};

const handlePushMessage = (
  payload: PushPayload,
  store: StoreType,
  router: Router
) => {
  // Filter out notifications originated from the current user
  const myUser = store.getters.myUser;
  if (myUser && payload.actor && myUser.id === payload.actor) {
    // We use the clicked event with action "auto_dismiss" so the
    // backend marks the notification as read.
    patchPushNotification(payload.code, payload.id, {
      clicked: true,
      clickaction: "auto_dismiss",
    });
    return;
  }

  const data: NotificationData = {
    route: payload.route,
    ...payload.data
  }

  // Build notification actions
  const actions: Array<{ label: string; color: string; handler: () => void }> = [];

  // Add custom actions from payload
  if (payload.actions && payload.actions.length > 0) {
    payload.actions.forEach((action) => {
      actions.push({
        label: action.title,
        color: "onsurface",
        handler: () => {
          const route = getActionRoute(action.action, data);
          if (route) {
            router.push(route);
          }
          onNotificationInteraction(payload.code, payload.id, action.action);
        },
      });
    });
  } else if (data.route) {
    // Default action to open the notification route
    actions.push({
      label: i18n.global.t("open"),
      color: "onsurface",
      handler: () => {
        router.push(data.route);
        onNotificationInteraction(payload.code, payload.id, "open_route");
      },
    });
  }

  // Always add a dismiss action
  actions.push({
    label: i18n.global.t("dismiss"),
    color: "onsurface",
    handler: () => {
      onNotificationInteraction(payload.code, payload.id, "dismiss");
    },
  });

  // Optimistically increment the unread count for the badge.
  store.commit("notifications/incrementUnreadCount");

  // Show the notification using Quasar Notify
  Notify.create({
    message: payload.title,
    caption: payload.body,
    icon: payload.image ? undefined : "notifications",
    avatar: payload.image,
    timeout: 0, // persistent
    type: "info",
    position: "top",
    actions,
    color: "surface",
    textColor: "onsurface",
    multiLine: true,
  });
};
