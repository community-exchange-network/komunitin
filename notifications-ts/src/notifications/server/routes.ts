import { Router } from "express"
import { listNotifications, markNotificationsRead } from "./notifications.controller"
import { upsertSubscription, deleteSubscription } from "./subscriptions.controller"
import { userAuth } from "../../server/auth"
import { updatePushNotification } from "./push.controller"

const router = Router()

router.get("/:code/notifications", userAuth(), listNotifications)
router.post("/:code/notifications/read", userAuth(), markNotificationsRead)

// Push notification subscriptions
router.post("/:code/subscriptions", userAuth(), upsertSubscription)
router.delete("/:code/subscriptions/:id", userAuth(), deleteSubscription)

// Push notification telemetry
router.patch("/:code/push-notifications/:id", updatePushNotification)


export default router
