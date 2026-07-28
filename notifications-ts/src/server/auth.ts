import { auth as authJwt } from "express-oauth2-jwt-bearer"
import { config } from "../config"
import type { Request, RequestHandler } from "express"
import { forbidden, unauthorized } from "../utils/error"

const jwt = authJwt({
  issuer: config.AUTH_JWT_ISSUER,
  audience: config.AUTH_JWT_AUDIENCE,
  jwksUri: config.AUTH_JWKS_URL,
})

export const Scope = {
  NotificationsRead: "notifications:read",
  NotificationsWrite: "notifications:write",
} as const

type NotificationsScope = typeof Scope[keyof typeof Scope]

type AuthPayload = {
  client_id?: unknown
  scope?: unknown
  sub?: unknown
}

const getPayload = (req: Request): AuthPayload => {
  return (req as Request & { auth?: { payload?: AuthPayload } }).auth?.payload ?? {}
}

const hasScope = (payload: AuthPayload, requiredScope: NotificationsScope) => {
  return typeof payload.scope === "string"
    && payload.scope.split(/\s+/).includes(requiredScope)
}

const authenticate = (
  authorize: (req: Request) => void,
): RequestHandler[] => [
  jwt,
  (req, _res, next) => {
    authorize(req)
    next()
  },
]

export const userAuth = (scope: NotificationsScope) => {
  return authenticate((req) => {
    const payload = getPayload(req)
    if (!hasScope(payload, scope)) {
      throw forbidden("Missing required scope")
    }
    if (
      payload.client_id !== "komunitin-app"
      || typeof payload.sub !== "string"
    ) {
      throw forbidden("App user token required")
    }
  })
}

export const eventsAuth = () => {
  return authenticate((req) => {
    const payload = getPayload(req)
    if (!hasScope(payload, Scope.NotificationsWrite)) {
      throw forbidden("Missing required scope")
    }
    if (
      typeof payload.client_id !== "string"
      || payload.sub !== payload.client_id
    ) {
      throw forbidden("Service token required")
    }
  })
}

export const getAuthenticatedUserId = (req: Request) => {
  const subject = getPayload(req).sub
  if (typeof subject !== "string") {
    throw unauthorized()
  }
  return subject
}

export const validateUserId = (req: Request, userId: string) => {
  if (getAuthenticatedUserId(req) !== userId) {
    throw forbidden()
  }
}
