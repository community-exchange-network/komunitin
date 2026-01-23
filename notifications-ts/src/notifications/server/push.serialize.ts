import { PushNotification } from "@prisma/client"

export const serializePushNotification = (notification: PushNotification) => {
  return {
    type: "push-notifications",
    id: notification.id,
    attributes: {
      delivered: notification.deliveredAt,
      clicked: notification.clickedAt,
      clickaction: notification.clickedAction,
      created: notification.createdAt,
      sent: notification.sentAt,
    }
  }
}
