import { PushSubscription } from "@prisma/client"

export const serializeSubscription = (subscription: PushSubscription) => {
  return {
    type: "subscriptions",
    id: subscription.id,
    attributes: {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      meta: subscription.meta,
      created: subscription.createdAt,
      updated: subscription.updatedAt,
    }
  }
}
