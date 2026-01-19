import { Request } from "express"
import prisma from "../utils/prisma"

export const getUserId = async (req: Request) => {
  const auth = (req as any).auth
  const userId = auth?.payload.sub

  /** In komunitin all ids (including user ids) are uuid, but the legacy auth service 
   * (Drupal) is providing a numeric id from which whe can search the actual uuid. 
   * */
  if (/^\d+$/.test(userId)) {
    const user = await prisma.appNotification.findFirst({
      select: { userId: true },
      where: {
        userId: {
          startsWith: "75736572-2020-",
          endsWith: "-" + parseInt(userId).toString(16).padStart(12, "0")
        }
      }
    })
    return user?.userId ?? null
  } else {
    return userId ?? null
  }
}