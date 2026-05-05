import type { NextFunction, Request, Response } from 'express'
import { InvalidTokenError, auth as authJwt } from 'express-oauth2-jwt-bearer'
import { config } from '../config'
import logger from '../utils/logger'
import { unauthorized } from '../utils/error'

type JwtPayload = {
  sub?: string
}

const buildJwt = () => {
  return authJwt({
    issuer: config.AUTH_JWT_ISSUER,
    audience: config.AUTH_JWT_AUDIENCE,
    jwksUri: config.AUTH_JWKS_URL,
    validators: {
      // IntegralCES may append a language code to iss.
      iss: (iss) => typeof iss === 'string' && iss.startsWith(config.AUTH_JWT_ISSUER),
    }
  })
}

let jwt = buildJwt()
let lastInvalidTokenRetry = 0

export const userAuth = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    jwt(req, res, (err) => {
      if (!err) {
        next()
        return
      }

      const mustRefresh = err instanceof InvalidTokenError
        && lastInvalidTokenRetry < Date.now() - 1000 * 60 * 5

      if (mustRefresh) {
        lastInvalidTokenRetry = Date.now()
        jwt = buildJwt()
        logger.warn('Invalid token error. Refreshing JWKS.')
        jwt(req, res, next)
        return
      }

      next(err)
    })
  }
}

const getAuthPayload = (req: Request): JwtPayload => {
  const payload = (req as any).auth?.payload as JwtPayload | undefined
  if (!payload) {
    throw unauthorized('Missing authentication payload')
  }
  return payload
}

export const getAuthUserId = (req: Request): string => {
  const payload = getAuthPayload(req)
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw unauthorized('Token subject is required')
  }
  return payload.sub
}
