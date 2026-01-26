import { Request, Response, NextFunction } from "express"
import prisma from "../../utils/prisma"
import { pagination } from "../../server/request"
import { serializeNotification } from "./notifications.serialize"
import { getUserId } from "../../server/auth-compat"

export const listNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params
    const userId = await getUserId(req)

    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`.replace(/\/$/, '')

    if (!userId) {
      // This is a case where the authentication header is ok but we can't get a user id. That
      // happens only if the user is not (yet) in this database. In particular, that means that
      // there are no notifications for them.
      res.json({
        links: { self: baseUrl, next: null },
        data: [],
      })
      return
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

