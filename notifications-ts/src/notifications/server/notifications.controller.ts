import { Request, Response, NextFunction } from "express"
import prisma from "../../utils/prisma"
import { pagination } from "../../server/request"
import { serializeNotification } from "./notifications.serialize"
import { getAuthenticatedUserId } from "../../server/auth"

/**
 * Mark all notifications as read for the authenticated user.
 * POST /:code/notifications/read
 */
export const markNotificationsRead = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params
    const userId = getAuthenticatedUserId(req)

    const result = await prisma.appNotification.updateMany({
      where: {
        tenantId: code,
        userId: userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    })

    res.json({
      meta: { updated: result.count },
    })
  } catch (err) {
    next(err)
  }
}

export const listNotifications = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code } = req.params
    const userId = getAuthenticatedUserId(req)

    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`.replace(/\/$/, '')

    const { cursor, size } = pagination(req)
    
    // Member filtering is postponed.

    const [notifications, unreadCount] = await Promise.all([
      prisma.appNotification.findMany({
        where: {
          tenantId: code,
          userId: userId,
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: cursor,
        take: size,
      }),
      prisma.appNotification.count({
        where: {
          tenantId: code,
          userId: userId,
          readAt: null,
        },
      }),
    ])
    
    const response = {
      links: {
        self: `${baseUrl}?page[after]=${cursor}&page[size]=${size}`,
        next: notifications.length === size ? `${baseUrl}?page[after]=${cursor + size}&page[size]=${size}` : null
      },
      meta: {
        unread: unreadCount,
      },
      data: notifications.map(serializeNotification)
    }

    res.json(response)
  } catch (err) {
    next(err)
  }
}
