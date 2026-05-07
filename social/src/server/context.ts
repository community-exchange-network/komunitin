import { getAuthUserId, getOptionalAuthUserId, isSuperadmin } from "./auth"
import type { Request } from "express"

type BaseContext = {
  isSuperadmin: boolean
}

export type AuthContext = BaseContext & {
  userId: string
}

export type AnonContext = BaseContext & {
  isSuperadmin: false
  userId?: undefined
}

export type OptionalAuthContext = AuthContext | AnonContext

/**
 * To be used by functions that require an authenticated user.
 */
export const getAuthContext = (req: Request): AuthContext => {
  return {
    userId: getAuthUserId(req),
    isSuperadmin: isSuperadmin(req),
  }
}

/**
 * To be used by functions that can optionally have an authenticated user, but don't require one.
 */
export const getOptionalAuthContext = (req: Request): OptionalAuthContext => {
  const userId = getOptionalAuthUserId(req)
  // Using this somewhat weird pattern to satisfy TypeScript.
  return (userId !== undefined) ? {
    userId,
    isSuperadmin: isSuperadmin(req),
  } : {
    isSuperadmin: false,
  }
}
