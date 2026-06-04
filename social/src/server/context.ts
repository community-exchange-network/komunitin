import type { Request } from "express"
import { getAuthScopes, getAuthToken, getAuthUserId, getOptionalAuthUserId, isSuperadmin } from "./auth"

type BaseContext = {
  isSuperadmin: boolean
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

/**
 * To be used by functions that require an authenticated user.
 */
export const getAuthContext = (req: Request): AuthContext => {
  return {
    userId: getAuthUserId(req),
    isSuperadmin: isSuperadmin(req),
    token: getAuthToken(req),
    scopes: getAuthScopes(req),
  }
}

/**
 * To be used by functions that can optionally have an authenticated user, but don't require one.
 */
export const getOptionalAuthContext = (req: Request): OptionalAuthContext => {
  const userId = getOptionalAuthUserId(req)

  if (userId !== undefined) {
    return {
      userId,
      isSuperadmin: isSuperadmin(req),
      token: getAuthToken(req),
      scopes: getAuthScopes(req),
    }
  }

  return {
    isSuperadmin: false,
    scopes: [],
  }
}
