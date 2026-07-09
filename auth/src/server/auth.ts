import type { NextFunction, Request, Response } from 'express'
import { config } from '../config'
import { verifySignedToken } from '../oidc/token-verifier'
import { unauthorized } from '../utils/error'
import prisma from '../utils/prisma'
import { isUuid } from '../utils/uuid'
import { UserStatus } from '../users/status'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email?: string
  }
}

export async function userAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(unauthorized('Missing or invalid Authorization header'))
  }

  const token = authHeader.split(' ')[1]
  try {
    const { payload } = await verifySignedToken(token, {
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    })

    const userId = typeof payload.sub === 'string' ? payload.sub : undefined
    if (
      payload.client_id !== 'komunitin-app'
      || payload.gty === 'client_credentials'
      || !userId
      || !isUuid(userId)
    ) {
      return next(unauthorized('Invalid or expired token'))
    }

    const user = await prisma.user.findUnique({
      where: { 
        id: userId,
        status: UserStatus.Active,
      },
      select: {
        id: true,
        email: true,
        status: true,
      },
    })

    if (!user) {
      return next(unauthorized('Invalid or expired token'))
    }

    req.user = {
      id: user.id,
      email: user.email,
    }
    next()
  } catch (err) {
    next(unauthorized('Invalid or expired token'))
  }
}

export function serviceClientAuth(clientId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(unauthorized('Missing or invalid Authorization header'))
    }

    try {
      const { payload } = await verifySignedToken(authHeader.split(' ')[1], {
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
      })

      const userId = typeof payload.sub === 'string' ? payload.sub : undefined
      if (payload.client_id !== clientId || (userId && isUuid(userId))) {
        return next(unauthorized('Invalid or expired token'))
      }

      next()
    } catch (err) {
      next(unauthorized('Invalid or expired token'))
    }
  }
}

export const notificationsServiceAuth = serviceClientAuth('komunitin-notifications')

export const socialServiceAuth = serviceClientAuth('komunitin-social')
