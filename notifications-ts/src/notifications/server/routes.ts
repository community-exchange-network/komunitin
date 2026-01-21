import { Router } from "express"
import { listNotifications } from "./controller"
import { upsertSubscription, deleteSubscription } from "./subscriptions.controller"
import { userAuth } from "../../server/auth"

const router = Router()

router.get("/:code/notifications", userAuth(), listNotifications)

// Push notification subscriptions
router.post("/:code/subscriptions", userAuth(), upsertSubscription)
router.delete("/:code/subscriptions/:id", userAuth(), deleteSubscription)

export default router
