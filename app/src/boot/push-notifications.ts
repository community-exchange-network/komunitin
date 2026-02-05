import { boot } from "quasar/wrappers";
import { Notify } from "quasar";
import { i18n } from "./i18n";
import { getActionRoute, type NotificationData, type PushPayload } from "src/utils/push-notifications";
import type { Router } from "vue-router";
import store from "src/store";

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
});

type StoreType = typeof store

const handlePushMessage = (
  payload: PushPayload,
  store: StoreType,
  router: Router
) => {
  // Filter out notifications originated from the current user
  const myUser = store.getters.myUser;
  if (myUser && payload.actor && myUser.id === payload.actor) {
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
      },
    });
  }

  // Always add a dismiss action
  actions.push({
    label: i18n.global.t("dismiss"),
    color: "onsurface",
    handler: () => {},
  });

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
