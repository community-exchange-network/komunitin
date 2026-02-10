import { Request } from "express"
import prisma from "../utils/prisma"
import { forbidden, unauthorized } from "../utils/error"

const USER_ID_FIXED_PREFIX = "75736572-2020-"
export const getUserId = async (req: Request) : Promise<string|null> => {
  const auth = (req as any).auth
  const userId = auth?.payload.sub

  /** 
   * In komunitin all ids (including user ids) are uuid, but the legacy auth service 
   * (Drupal) is providing a numeric id from which we can search the actual uuid. 
   * */
  if (/^\d+$/.test(userId)) {
    const user = await prisma.appNotification.findFirst({
      select: { userId: true },
      where: {
        userId: {
          startsWith: USER_ID_FIXED_PREFIX,
          endsWith: "-" + parseInt(userId).toString(16).padStart(12, "0")
        }
      }
    })
    return user?.userId ?? null
  } else {
    return userId ?? null
  }
}

/**
 * 
 * @param req The authorized request
 * @param userId The user uuid
 */
export const validateUserId = (req: Request, userId: string) => {
  const auth = (req as any).auth
  const authUserId = auth?.payload.sub

  if (!authUserId) {
    throw unauthorized()
  }
  if (authUserId !== userId && !(
    /^\d+$/.test(authUserId) && userId.startsWith(USER_ID_FIXED_PREFIX) 
    && userId.endsWith("-" + parseInt(authUserId).toString(16).padStart(12, "0"))
  )) {
    throw forbidden()
  }
}