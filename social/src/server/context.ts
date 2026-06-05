import { getAuthScopes, getAuthToken, getAuthUserId, getOptionalAuthUserId } from "./auth"
import type { Request } from "express"

type BaseContext = {
  isSuperadmin: boolean
  isSocialReadAll: boolean
  scopes: string[]
}

export type AuthContext = BaseContext & {
  userId: string
  token: string
}

export type AnonContext = BaseContext & {
  isSuperadmin: false
  userId?: undefined
  token?: string
}

export type OptionalAuthContext = AuthContext | AnonContext

export const Scope = {
  Superadmin: 'komunitin_superadmin',
  SocialReadAll: 'komunitin_social_read_all',
} as const

/**
 * To be used by functions that require an authenticated user.
 */
export const getAuthContext = (req: Request): AuthContext => {
  const scopes = getAuthScopes(req)
  return {
    userId: getAuthUserId(req),
    isSuperadmin: scopes.includes(Scope.Superadmin),
    isSocialReadAll: scopes.includes(Scope.SocialReadAll),
    token: getAuthToken(req),
    scopes,
  }
}

/**
 * To be used by functions that can optionally have an authenticated user, but don't require one.
 */
export const getOptionalAuthContext = (req: Request): OptionalAuthContext => {
  const userId = getOptionalAuthUserId(req)
  const scopes = getAuthScopes(req)

  if (userId !== undefined) {
    return {
      userId,
      isSuperadmin: scopes.includes(Scope.Superadmin),
      isSocialReadAll: scopes.includes(Scope.SocialReadAll),
      token: getAuthToken(req),
      scopes,
    }
  }

  return {
    isSuperadmin: false,
    isSocialReadAll: false,
    scopes,
  }
}
