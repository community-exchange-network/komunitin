import { Request } from 'express'
import { Scope } from '../server/auth'

export interface Context {
  /**
   * The context type
   */
  type: "anonymous" | "user" | "external" | "last-hash" | "superadmin" | "system"
  /**
   * The user ID of the authenticated user.
   */
  userId?: string
  /**
   * The account public key of the authenticated user (for external type).
   */
  accountKey?: string
  lastHashAuth?: {
    peerNodePath: string
    lastHash: string
    requestTrace: string
  }
}

export const context = (req: Request): Context => {
  const payload = req.auth?.payload
  const scopes = (payload?.scope as string).split(" ") ?? []

  if (!payload) {
    return {
      type: "anonymous"
    }
  // This case happens when the token is the "external jwt" token
  } else if ("type" in payload && payload.type === "external") {
    return {
      type: "external",
      accountKey: payload.sub
    }
  } else if ("type" in payload && payload.type === "last-hash") {
    return {
      type: payload.type,
      lastHashAuth: {
        peerNodePath: payload.peerNodePath as string,
        lastHash: payload.lastHash as string,
        requestTrace: payload.requestTrace as string
      },
    }
  } else if (scopes.includes(Scope.Superadmin)) {
    return {
      type: "superadmin",
    }
  } else if (typeof payload.sub === "string") {
    return {
      type: "user",
      userId: payload.sub
    }
  // This case happens when the notifications service uses the service.
  } else if (payload.sub === null) {
    return {
      type: "system"
    }
  } else {
    throw new Error("Invalid sub claim in JWT")
  }
}

export const systemContext = (): Context => {
  return {
    type: "system",
  }
}