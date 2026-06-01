import { Request, Response, NextFunction } from 'express'
import { config } from '../config'
import { verifySignedToken } from '../oidc/jwks'
import { unauthorized } from '../utils/error'
import prisma from '../utils/prisma'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
      issuer: config.ISSUER_URL,
      audience: 'app',
    })

    const userId = typeof payload.sub === 'string' ? payload.sub : undefined
    if (payload.gty === 'client_credentials' || !userId || !UUID_PATTERN.test(userId)) {
      return next(unauthorized('Invalid or expired token'))
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
      },
    })

    if (!user || user.status !== 'active') {
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
