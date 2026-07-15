import type { NextFunction, Request, Response } from 'express'
import { InvalidTokenError, auth as authJwt, requiredScopes } from 'express-oauth2-jwt-bearer'
import { z } from 'zod'
import { config } from '../config'
import logger from '../utils/logger'
import { unauthorized } from '../utils/error'
import { Scope, type SocialScope } from './scopes'

type JwtPayload = {
  sub?: string
  client_id?: string
  scope?: string
}

export type AuthIdentity = {
  subject: string
  clientId: string
  isService: boolean
}

const APP_CLIENT_ID = 'komunitin-app'
const uuidSchema = z.uuid()

const buildJwt = () => {
  return authJwt({
    issuer: config.AUTH_JWT_ISSUER,
    audience: config.AUTH_JWT_AUDIENCE,
    jwksUri: config.AUTH_JWKS_URL,
  })
}

let jwt = buildJwt()
let lastInvalidTokenRetry = 0

const handleAuthRequest = (scope: SocialScope, req: Request, res: Response, next: NextFunction) => {
  jwt(req, res, (err) => {
    if (!err) {
      requiredScopes(scope)(req, res, next)
      return
    }

    const mustRefresh = err instanceof InvalidTokenError
      && lastInvalidTokenRetry < Date.now() - 1000 * 60 * 5

    if (mustRefresh) {
      lastInvalidTokenRetry = Date.now()
      jwt = buildJwt()
      logger.warn('Invalid token error. Refreshing JWKS.')
      handleAuthRequest(scope, req, res, next)
      return
    }

    next(err)
  })
}

export const userAuth = (scope: SocialScope) => {
  return (req: Request, res: Response, next: NextFunction) => {
    handleAuthRequest(scope, req, res, next)
  }
}

export const optionalUserAuth = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.headers.authorization
    if (typeof authorization !== 'string' || !authorization.toLowerCase().startsWith('bearer ')) {
      next()
      return
    }

    handleAuthRequest(Scope.SocialRead, req, res, next)
  }
}

const getAuthPayload = (req: Request): JwtPayload => {
  const payload = (req as any).auth?.payload as JwtPayload | undefined
  if (!payload) {
    throw unauthorized('Missing authentication payload')
  }
  return payload
}

const getOptionalAuthPayload = (req: Request): JwtPayload | undefined => {
  return (req as any).auth?.payload as JwtPayload | undefined
}

const parseAuthIdentity = (payload: JwtPayload): AuthIdentity => {
  const subject = payload.sub
  const clientId = payload.client_id
  if (typeof subject !== 'string' || typeof clientId !== 'string') {
    throw unauthorized('Token subject and client are required')
  }

  if (subject === clientId) {
    return { subject, clientId, isService: true }
  }

  if (clientId !== APP_CLIENT_ID || !uuidSchema.safeParse(subject).success) {
    throw unauthorized('Invalid token subject or client')
  }

  return { subject, clientId, isService: false }
}

export const getAuthIdentity = (req: Request): AuthIdentity => {
  return parseAuthIdentity(getAuthPayload(req))
}

export const getOptionalAuthIdentity = (req: Request): AuthIdentity | undefined => {
  const payload = getOptionalAuthPayload(req)
  if (!payload) {
    return undefined
  }
  return parseAuthIdentity(payload)
}

export const getAuthScopes = (req: Request): string[] => {
  const payload = getOptionalAuthPayload(req)
  if (payload === undefined || typeof payload.scope !== 'string' || payload.scope.trim() === '') {
    return []
  }

  return payload.scope.split(/\s+/).filter(Boolean)
}

export const getAuthToken = (req: Request): string => {
  const authorization = req.headers.authorization
  if (authorization === undefined || !authorization.toLowerCase().startsWith('bearer ')) {
    throw unauthorized('Missing authorization header')
  }
  return authorization.slice(7)
}
