import { FirebaseApp, initializeApp } from "@firebase/app";
import { getMessaging, getToken, Messaging } from "@firebase/messaging"
import {ResourceObject, UserSettings} from "../store/model"

import { Member, NotificationsSubscription, User } from "src/store/model";
import KError, { KErrorCode } from "src/KError";

import firebaseConfig from "./firebase-config";
import { getService } from "../services/services";
import { CreateResourceOptions } from "../services/resources";

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
   * 
   * @return the subscription id.
   */
  public async subscribe(user: User, member: Member, settings: SubscriptionSettings): Promise<string> {
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

      const externalRelationship = (resource: ResourceObject) => ({
        data: {
          id: resource.id,
          type: resource.type,
          meta: {
            external: true,
            href: resource.links.self
          }
        }
      })

      // Send registration token to the server.
      const subscription = {
        type: "subscriptions",
        attributes: {
          token,
          settings
        },
        relationships: {
          user: externalRelationship(user),
          member: externalRelationship(member)
        }
      }
      const service = getService<NotificationsSubscription>("notifications")
      const response = await service.create({
        resource: subscription,
        group: ""
      } as CreateResourceOptions<NotificationsSubscription>) 
      
      return response.data!.id

    } catch (err) {
      // The user doesn't grant the app to receive notifications.
      throw new KError(KErrorCode.NotificationsPermissionDenied, 'An error occurred with notifications subscription.' + err);
    }
  }

  /**
   * Unsubscribe the current device, user and member from push notifications.
   */
  public async unsubscribe(subscriptionId: string): Promise<void> {
    const service = getService<NotificationsSubscription>("notifications")
    await service.delete({
      group: "",
      id: subscriptionId
    })    
  }

  public hasPermission() {
    return window && window.Notification && window.Notification.permission === "granted"
  }
}

export const notifications = new Notifications()