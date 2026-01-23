import { config } from "src/utils/config"
import { urlBase64ToUint8Array } from "src/utils/encoding";
import KError, { KErrorCode } from "../KError";

export interface WebPushSubscriptionAttributes {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  meta?: {
    userAgent: string;
  };
}

export const subscribe = async (): Promise<WebPushSubscriptionAttributes> => {
  const vapidPublicKey = config.PUSH_NOTIFICATIONS_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    throw new KError(KErrorCode.ScriptError, "Missing VAPID public key for push notifications");
  }

  if (!('serviceWorker' in navigator)) {
    throw new KError(KErrorCode.ScriptError, "Service Worker not supported");
  }

  const registration = await navigator.serviceWorker.ready;
  const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey
    });
  }

  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');

  if (!p256dh || !auth) {
    throw new KError(KErrorCode.ScriptError, "Unable to get subscription keys");
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
      auth: btoa(String.fromCharCode(...new Uint8Array(auth)))
    },
    meta: (navigator && { userAgent: navigator.userAgent }) || undefined
  };
}

/**
 * Unsubscribe the current device from push notifications. Note that the permission
 * granted by the user is not revoked.
 */
export const unsubscribe = async (): Promise<void> => {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
  }
}

