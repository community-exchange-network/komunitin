import { Router } from "express"
import { listNotifications, markNotificationsRead } from "./notifications.controller"
import { upsertSubscription, deleteSubscription } from "./subscriptions.controller"
import { Scope, userAuth } from "../../server/auth"
import { updatePushNotification } from "./push.controller"

const router = Router()

router.get("/:code/notifications", userAuth(Scope.NotificationsRead), listNotifications)
router.post("/:code/notifications/read", userAuth(Scope.NotificationsWrite), markNotificationsRead)

// Push notification subscriptions
router.post("/:code/subscriptions", userAuth(Scope.NotificationsWrite), upsertSubscription)
router.delete("/:code/subscriptions/:id", userAuth(Scope.NotificationsWrite), deleteSubscription)

// Push notification telemetry. We are intentionally not authenticating this route
// because the client might not have a valid token when receiving the push notification.
router.patch("/:code/push-notifications/:id", updatePushNotification)


export default router
