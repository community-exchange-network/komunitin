import { Router } from "express"
import { listNotifications } from "./controller"
import { userAuth } from "../../server/auth"

const router = Router()

router.get("/:code/notifications", userAuth(), listNotifications)

export default router
