/// <reference lib="webworker" />
// Workbox
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'
// Komunitin
import { getConfig, setConfig } from "./sw-config"

declare const self: ServiceWorkerGlobalScope

// This version will be replaced by DefinePlugin at build time
const SW_VERSION = process.env.APP_VERSION

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
    })
  } catch (err) {
    console.error("Failed to post notification status", err)
  }
}

self.addEventListener("push", (event: PushEvent) => {
  const payload = parsePushPayload(event)
  if (!payload) {
    return
  }

  const title = payload.title
  const route = payload.route || "/"

  const showPromise = self.registration.showNotification(title, {
    body: payload.body,
    icon: payload.image,
    data: {
      route,
      code: payload.code,
      id: payload.id,
    },
    /*
      actions: [{
        action: 'open',
        title: 'Open App'
      }],
    */
    tag: payload.id,
  })
  // Notify backend that the notification has been delivered.
  const deliveredPromise = updateNotificationEvent(payload.code, payload.id, {
    deliveredAt: new Date(),
  })

  event.waitUntil(Promise.allSettled([showPromise, deliveredPromise]))
})

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close()

  // TODO: handle custom actions once defined (event.action)
  // if (event.action) {
  //   return
  // }

  const data = (event.notification.data || {}) as {
    route?: string
    code?: string
    id?: string
  }
  const route = data.route || "/"
  const targetUrl = new URL(route, self.location.origin).toString()

  const openPromise = (async () => {
    const windowClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    })

    let matchingClient = null
    for (const client of windowClients) {
      const clientUrl = new URL(client.url, self.location.origin)
      const targetUrlObj = new URL(targetUrl, self.location.origin)
      if (clientUrl.origin === targetUrlObj.origin) {
        matchingClient = client
        break
      }
    }

    if (matchingClient) {
      if ("focus" in matchingClient) {
        await matchingClient.focus()
      }
      if (matchingClient.url !== targetUrl && "navigate" in matchingClient) {
        await matchingClient.navigate(targetUrl)
      }
    } else {
      await self.clients.openWindow(targetUrl)
    }
  })()

  // Notify backend that the notification has been clicked.
  const clickedPromise = updateNotificationEvent(data.code, data.id, {
    clickedAt: new Date(),
  })

  event.waitUntil(Promise.allSettled([openPromise, clickedPromise]))
})

