// Workbox
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'
// Firebase
import { onBackgroundMessage, getMessaging } from "firebase/messaging/sw"
import { initializeApp } from 'firebase/app'
import firebaseConfig from '../src/plugins/FirebaseConfig'
// Komunitin
import store from "../src/store"
import { notificationBuilder } from './notifications'

// This version will be replaced by DefinePlugin at build time
const SW_VERSION = process.env.APP_VERSION

// Add a listener for messages from the client (register-service-worker.ts).
self.addEventListener('message', (event: any) => {
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: SW_VERSION })
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // This command makes the service worker to take control of the current pages.
    (self as any).skipWaiting()
  }
})

// Precache generated manifest file.
precacheAndRoute((self as any).__WB_MANIFEST)

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

// Initialize Firebase so we receive push notifications.
const app = initializeApp(firebaseConfig)
//Note that this getMessaging is not the same as the one in src/plugins/Notifications.ts
const messaging = getMessaging(app)
const notification = notificationBuilder(store)

// Push Message handler. 
onBackgroundMessage(messaging, async (payload) => {
  try {
    const {title, options} = await notification(payload)
    return (self as any).registration.showNotification(title, options)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error)
  }
})

self.addEventListener('notificationclick', function(event: any) {
  event.notification.close();
  // If a window matching the app is already open, focus that;
  // otherwise, open a new one.
  event.waitUntil(
    (self as any).clients.matchAll({type: 'window'}).then((clientList: any[]) => {
      const url = event.notification.data?.url as string | undefined
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i]
        if (client.focus && client.navigate) {
          if (url && (client.url !== url)) {
            return client.navigate(url).then((client: any) => client.focus())
          } else {
            return client.focus()
          }
        }
      }
      if (url && (self as any).clients.openWindow) {
        return (self as any).clients.openWindow(url)
      }
    })
  );

})
