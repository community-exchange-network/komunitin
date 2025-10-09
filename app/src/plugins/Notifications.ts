import type { FirebaseApp} from "firebase/app";
import { initializeApp } from "firebase/app";
import type { Messaging } from "firebase/messaging";
import { getMessaging, getToken } from "firebase/messaging"
import { KOptions } from "../boot/koptions"
import type {UserSettings} from "../store/model"

import type { Member, NotificationsSubscription, User } from "src/store/model";
import KError, { KErrorCode } from "src/KError";

import firebaseConfig from "./FirebaseConfig";

export type SubscriptionSettings = UserSettings['attributes']['notifications'] & { locale: string }

class Notifications {

  private app: FirebaseApp | null = null
  private messaging: Messaging | null = null
  /**
   * @returns The Firebase Messaging class, to be called from the main thread.
   */
  public getMessaging() : Messaging {
    if (this.app === null) {
      this.app = initializeApp(firebaseConfig)
    }
    if (this.messaging === null) {
      this.messaging = getMessaging(this.app)
    }
    return this.messaging;
  }

  /**
   * Subscribe the current device, user and member to push notifications.
  */
  public async subscribe(user: User, member: Member, settings: SubscriptionSettings, accessToken: string): Promise<NotificationsSubscription> {
    // Initialize Firebase
    const messaging = this.getMessaging();
    const vapidKey = process.env.PUSH_SERVER_KEY;
    const serviceWorkerRegistration = await window.navigator.serviceWorker.getRegistration()
    try {
      // Get registration token. Initially this makes a network call, once retrieved
      // subsequent calls to getToken will return from cache.
      const token = await getToken(messaging, { 
        vapidKey,
        serviceWorkerRegistration
      });
      const message = {
        data: {
          type: "subscriptions",
          attributes: {
            token,
            settings
          },
          relationships: {
            user: {
              data: {
                id: user.id,
                type: "users",
                meta: {
                  external: true,
                  href: user.links.self
                }
              }
            },
            member: {
              data: {
                id: member.id,
                type: "members",
                meta: {
                  external: true,
                  href: member.links.self
                }
              }
            }
          }
        }
      }
      // Send token to the server.
      const response = await fetch(KOptions.url.notifications + '/subscriptions', {
        method: 'POST',
        body: JSON.stringify(message),
        headers: {
          Accept: "application/vnd.api+json",
          "Content-Type": "application/vnd.api+json",
          Authorization: `Bearer ${accessToken}` 
        }
      })
      const data = await response.json();

      return data.data

    } catch (err) {
      // The user doesn't grant the app to receive notifications.
      throw new KError(KErrorCode.NotificationsPermissionDenied, 'An error occurred with notifications subscription.' + err);
    }
  }

  /**
   * Unsubscribe the current device, user and member from push notifications.
   */
  public async unsubscribe(subscription: NotificationsSubscription, accessToken: string): Promise<void> {
    await fetch(KOptions.url.notifications + '/subscriptions/' + subscription.id, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })
  }
}

export const notifications = new Notifications()