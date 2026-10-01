import type { Request } from "express"
import { getAuthIdentity, getAuthScopes, getAuthToken, getOptionalAuthIdentity } from "./auth"
import { Scope } from './scopes'

export { Scope } from './scopes'

type BaseContext = {
  isSuperadmin: boolean
  canReadAllSocial: boolean
  scopes: string[]
}

export type AuthContext = BaseContext & {
  userId: string
  token: string
}

export type AnonContext = BaseContext & {
  isSuperadmin: false
  canReadAllSocial: false
  userId?: undefined
  token?: string
}

export type OptionalAuthContext = AuthContext | AnonContext

/**
 * To be used by functions that require an authenticated user.
 */
export const getAuthContext = (req: Request): AuthContext => {
  const identity = getAuthIdentity(req)
  const scopes = getAuthScopes(req)
  return {
    userId: identity.subject,
    isSuperadmin: !identity.isService && scopes.includes(Scope.Superadmin),
    canReadAllSocial: identity.isService && scopes.includes(Scope.SocialRead),
    token: getAuthToken(req),
    scopes,
  }
}

/**
 * To be used by functions that can optionally have an authenticated user, but don't require one.
 */
export const getOptionalAuthContext = (req: Request): OptionalAuthContext => {
  const identity = getOptionalAuthIdentity(req)
  const scopes = getAuthScopes(req)

  if (identity !== undefined) {
    return {
      userId: identity.subject,
      isSuperadmin: !identity.isService && scopes.includes(Scope.Superadmin),
      canReadAllSocial: identity.isService && scopes.includes(Scope.SocialRead),
      token: getAuthToken(req),
      scopes,
    }
  }

  return {
    isSuperadmin: false,
    canReadAllSocial: false,
    scopes,
  }
}
