import { getAuthorizationHeader, getAuthScopes, getAuthUserId, getOptionalAuthUserId, isSuperadmin } from "./auth"
import type { Request } from "express"
import { unauthorized } from "../utils/error"

type BaseContext = {
  isSuperadmin: boolean
  scopes: string[]
}

export type AuthContext = BaseContext & {
  userId: string
  authorization: string
}

export type AnonContext = BaseContext & {
  isSuperadmin: false
  userId?: undefined
  authorization?: string
}

export type OptionalAuthContext = AuthContext | AnonContext

/**
 * To be used by functions that require an authenticated user.
 */
export const getAuthContext = (req: Request): AuthContext => {
  const authorization = getAuthorizationHeader(req)
  if (!authorization) {
    throw unauthorized('Missing authorization header')
  }

  return {
    userId: getAuthUserId(req),
    isSuperadmin: isSuperadmin(req),
    authorization,
    scopes: getAuthScopes(req),
  }
}

/**
 * To be used by functions that can optionally have an authenticated user, but don't require one.
 */
export const getOptionalAuthContext = (req: Request): OptionalAuthContext => {
  const userId = getOptionalAuthUserId(req)
  const authorization = getAuthorizationHeader(req)
  const scopes = getAuthScopes(req)
  // Using this somewhat weird pattern to satisfy TypeScript.
  if (userId !== undefined) {
    if (!authorization) {
      throw unauthorized('Missing authorization header')
    }

    return {
      userId,
      isSuperadmin: isSuperadmin(req),
      authorization,
      scopes,
    }
  }

  return {
    isSuperadmin: false,
    authorization,
    scopes,
  }
}
