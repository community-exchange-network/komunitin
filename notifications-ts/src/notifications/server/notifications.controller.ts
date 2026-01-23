import { Request, Response, NextFunction } from "express"
import prisma from "../../utils/prisma"
import { pagination } from "../../server/request"
import { serializeNotification } from "./notifications.serialize"
import { getUserId } from "../../server/auth-compat"

export const listNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params
    const userId = await getUserId(req)

    if (!userId) {
       // Should be handled by auth middleware but double check
       throw new Error("User not authenticated")
    }

    const { cursor, size } = pagination(req)
    
    // Member filtering is postponed.

    const notifications = await prisma.appNotification.findMany({
      where: {
        tenantId: code,
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: cursor,
      take: size,
    })
    
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`.replace(/\/$/, '')
    
    const response = {
      links: {
        self: `${baseUrl}?page[after]=${cursor}&page[size]=${size}`,
        next: notifications.length === size ? `${baseUrl}?page[after]=${cursor + size}&page[size]=${size}` : null
      },
      data: notifications.map(serializeNotification)
    }

    res.json(response)
  } catch (err) {
    next(err)
  }
}

