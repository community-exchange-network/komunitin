/// <reference lib="webworker" />
// Workbox
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'
import { Queue } from 'workbox-background-sync'
// Komunitin
import { getConfig, setConfig } from "./sw-config"
import { runAction } from './notification-actions'

declare const self: ServiceWorkerGlobalScope

// This version will be replaced by DefinePlugin at build time
const SW_VERSION = process.env.APP_VERSION

const requestQueue = new Queue('request-queue', {
  maxRetentionTime: 48 * 60, // Retry for max of 48 hours (in minutes)
})

// Keep track of clicked notifications to avoid double telemetry on notificationclose
const clickedNotifications = new Set<string>()

// Add a listener for messages from the client (register-service-worker.ts).
self.addEventListener('message', (event: MessageEvent) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION })
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // This command makes the service worker to take control of the current pages.
    self.skipWaiting()
  }
  if (event.data && event.data.type === 'SET_CONFIG') {
    setConfig(event.data.config)
    if (process.env.DEV) {
      console.log("Service worker config set:", event.data.config)
    }
  }

})

// Precache generated manifest file.
precacheAndRoute(self.__WB_MANIFEST)

clientsClaim()
cleanupOutdatedCaches()

// JS and CSS and assets should be already precached so we don't need to do any
// runtime caching.

// Cache images with a Cache First strategy for maximum performance.
registerRoute(
  // Check to see if the request's destination is style for an image
  ({ request }) => request.destination === 'image',
  // Use a Cache First caching strategy
  new CacheFirst({
    // Put all cached files in a cache named 'images'
    cacheName: 'images',
    plugins: [
      // Ensure that only requests that result in a 200 status are cached
      new CacheableResponsePlugin({
        statuses: [200],
      }),
      // Expire them after 30 days
      new ExpirationPlugin({
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
      }),
    ],
  }),
);

// Setup push notifications handler.
type PushPayload = {
  title: string
  body: string
  route: string
  code: string
  id: string
  image?: string
  data?: Record<string, unknown>
  actions?: {
    title: string
    action: string
  }[]
}

const parsePushPayload = (event: PushEvent): PushPayload | null => {
  if (!event.data) {
    return null
  }
  try {
    return event.data.json() as PushPayload
  } catch (err) {
    console.error("Failed to parse push payload", err)
    return null
  }
}

const updateNotificationEvent = async (
  code: string | undefined,
  id: string | undefined,
  attributes: Record<string, unknown>
): Promise<void> => {
  const config = await getConfig()

  if (!code || !id || !config.NOTIFICATIONS_URL) {
    return
  }
  const url = `${config.NOTIFICATIONS_URL}/${code}/push-notifications/${id}`

  const request = new Request(url, {
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
    })
  });

  try {
    const response = await fetch(request.clone())
    // Note that fetch throws on network errors, we dont need to re-queue requests with
    // valid 400 or 500 responses.
    if (!response.ok) {
      console.error("Failed to update notification event", response.status, await response.text())
    }
  } catch (err) {
    console.warn("Network error when updating notification event, queuing for background retry", err)
    await requestQueue.pushRequest({ request })
  }
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = parsePushPayload(event)
  if (!payload) {
    return
  }

  const title = payload.title
  const route = payload.route || "/"
  const icon = payload.image ||  new URL('/icons/icon-192x192.png', self.location.origin).toString()

  const showPromise = self.registration.showNotification(title, {
    body: payload.body,
    icon,
    data: {
      route,
      code: payload.code,
      id: payload.id,
      ...payload.data
    },
    actions: payload.actions,
    tag: payload.id,
  } as NotificationOptions)
  // Notify backend that the notification has been delivered.
  const deliveredPromise = updateNotificationEvent(payload.code, payload.id, {
    delivered: new Date(),
  })

  event.waitUntil(Promise.allSettled([showPromise, deliveredPromise]))
})

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  const data = (event.notification.data || {})
  
  if (data.id) {
    clickedNotifications.add(data.id)
  }

  event.notification.close()

  const actionPromise = runAction(event)

  // Notify backend that the notification has been clicked.
  const clickedPromise = updateNotificationEvent(data.code, data.id, {
    clicked: new Date(),
    clickedAction: event.action,
  })

  event.waitUntil(Promise.allSettled([actionPromise, clickedPromise]))
})

self.addEventListener('notificationclose', (event: NotificationEvent) => {
  const data = event.notification.data || {}

  if (data.id && clickedNotifications.has(data.id)) {
    clickedNotifications.delete(data.id)
    return
  }

  const dismissedPromise = updateNotificationEvent(data.code, data.id, {
    dismissed: new Date(),
  })

  event.waitUntil(dismissedPromise)
})
