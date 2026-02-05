import { AppNotification } from "@prisma/client"

export const serializeNotification = (notification: AppNotification) => {
  return {
    type: "notifications",
    id: notification.id,
    attributes: {
      title: notification.title,
      body: notification.body,
      image: notification.image,
      data: notification.data,
      
      read: notification.readAt,
      created: notification.createdAt,
    }
  }
}
