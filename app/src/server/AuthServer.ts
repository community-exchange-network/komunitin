// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "@/utils/config";
import { Auth, type SignupContext, type TokenResponse } from "../plugins/Auth";
import type { Server} from "miragejs";
import { Response } from "miragejs";
import { badRequest } from "./ServerUtils";
import { v4 as uuid } from "uuid";

type ActionTokenPurpose = "passwordReset" | "emailChange" | "emailVerification" | "unsubscribe" | "memberDeletion";

type ActionToken = {
  purpose: ActionTokenPurpose
  userId: string
  email: string
  signup?: SignupContext
  memberId?: string
  used?: boolean
}

const actionTokens = new Map<string, ActionToken>();
type RegisteredUser = {
  id: string
  email: string
  emailVerified: boolean
  password: string
  refreshToken: string
}

const registeredUsers = new Map<string, RegisteredUser>();
const accessTokenUsers = new Map<string, RegisteredUser>();
const deletedEmails = new Set<string>()
const revokedRefreshTokens = new Set<string>()

/** Mirror Auth identity deletion when Social removes the last mock membership. */
export function deleteMockIdentity(userId: string, email: string) {
  const user = registeredUsers.get(email)
  deletedEmails.add(email)
  revokedRefreshTokens.add(user?.refreshToken ?? `user:${userId}_refresh_token`)
  registeredUsers.delete(email)
  for (const [token, user] of accessTokenUsers) {
    if (user.id === userId) accessTokenUsers.delete(token)
  }
  for (const action of actionTokens.values()) {
    if (action.userId === userId) action.used = true
  }
}

/** Resolve tokens for registered users or specific seeded users. */
export function getMockAuthUser(accessToken: string) {
  const userId = /^user:(.+)_access_token$/.exec(accessToken)?.[1]
  return accessTokenUsers.get(accessToken) ?? (userId ? { id: userId } : undefined)
}

function statusOk() {
  return new Response(200, {}, { status: "ok" });
}

function invalidGrant(errorDescription: string) {
  return new Response(400, {}, {
    error: "invalid_grant",
    error_description: errorDescription
  })
}

function jsonBody(request: any) {
  const contentType = request.requestHeaders["Content-Type"] ?? request.requestHeaders["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  return JSON.parse(request.requestBody || "{}");
}

function newActionToken(purpose: ActionTokenPurpose, userId: string, email: string, signup?: SignupContext, memberId?: string) {
  const token = `${purpose}-${actionTokens.size + 1}`;
  actionTokens.set(token, { purpose, userId, email, signup, memberId });
  return token;
}

export function getMockPasswordResetToken(email: string) {
  return [...actionTokens.entries()].reverse().find(([, action]) =>
    action.email === email && action.purpose === "passwordReset"
  )?.[0]
}

function latestEmailVerification(userId: string) {
  return [...actionTokens.entries()].reverse().find(([, action]) =>
    action.userId === userId && action.purpose === "emailVerification"
  )
}

function publicUser(user: RegisteredUser, signup?: SignupContext) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    signup
  }
}

function consumeActionToken(token: string, purposes: ActionTokenPurpose[]) {
  const record = actionTokens.get(token);
  if (!record || record.used || !purposes.includes(record.purpose)) {
    return undefined;
  }
  record.used = true;
  return record;
}

export function redeemMockActionToken(token: string, purpose: ActionTokenPurpose) {
  const record = actionTokens.get(token);
  if (record?.purpose === "unsubscribe" && purpose === "unsubscribe") {
    return record;
  }
  return consumeActionToken(token, [purpose]);
}

let memberDeletionLink: string | undefined

/** Simulate Notifications requesting a member-bound token and building the email link. */
export function requestMockMemberDeletion(userId: string, email: string, memberId: string, groupCode: string) {
  for (const [key, action] of actionTokens) {
    if (action.userId === userId && action.purpose === 'memberDeletion' && !action.used) actionTokens.delete(key)
  }
  const token = newActionToken('memberDeletion', userId, email, undefined, memberId)
  memberDeletionLink = `/groups/${encodeURIComponent(groupCode)}/members/${memberId}/delete?token=${token}`
}

/** The confirmation link delivered by the mocked deletion email. */
export function getMockMemberDeletionLink() {
  return memberDeletionLink
}

export function redeemMockMemberDeletion(token: string, memberId: string) {
  const action = actionTokens.get(token)
  if (action?.purpose !== 'memberDeletion' || action.memberId !== memberId) return undefined
  const result = { ...action }
  action.used = true
  return result
}

/** Issue mock tokens for a specific user. */
export function mockToken(scope: string | null, { superadmin = false, userId }: {
  superadmin?: boolean
  userId: string
}): TokenResponse & { token_type: "Bearer" } {
  return {
    access_token: `user:${userId}_access_token`,
    refresh_token: `user:${userId}_refresh_token`,
    expires_in: 3600,
    token_type: "Bearer",
    scope: (scope ?? "").split(" ").filter(value => value !== Auth.SUPERADMIN_SCOPE || superadmin).join(" ")
  };
}

/**
 * Object containing the properties to create a MirageJS server that mocks an OAuth2 
 * server with features needed by the Komunitin app.
 */
export default {
  routes(server: Server) {
    // OAuth2 token
    server.post(
      config.AUTH_URL + "/token",
      (schema: any, request) => {
        const params = new URLSearchParams(request.requestBody);
        if (params.get("grant_type") == "authorization_code") {
          return badRequest("Unsupported grant type");
        }
        const param = params.get("refresh_token") || params.get("username") || "";
        if (deletedEmails.has(param) || revokedRefreshTokens.has(param)) {
          return invalidGrant("Invalid credentials")
        }
        const registered = registeredUsers.get(param)
          ?? [...registeredUsers.values()].find(user => user.refreshToken === param)
        if (registered) {
          if (params.get("grant_type") === "password" && registered.password !== params.get("password")) {
            return invalidGrant("Invalid credentials")
          }
          if (!registered.emailVerified) {
            return invalidGrant("Email is not verified")
          }
          const accessToken = `${registered.id}_access_token`
          accessTokenUsers.set(accessToken, registered)
          return new Response(200, {}, {
            ...mockToken(params.get("scope"), {
              userId: registered.id,
              superadmin: registered.email === "superadmin@example.com"
            }),
            access_token: accessToken,
            refresh_token: registered.refreshToken
          })
        }
        const username = params.get("username");
        if (params.get("grant_type") === "password" && !username?.includes("@")) {
          return invalidGrant("Invalid credentials")
        }
        const data = mockToken(params.get("scope") ?? "", {
          superadmin: username === "superadmin@example.com",
          userId: /^user:(.+)_refresh_token$/.exec(param)?.[1] ?? schema.users.first().id
        });
        return new Response(200, {}, data);
      }
    );

    server.post(config.AUTH_URL + "/register", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email || !body?.password || !body?.signup) {
        return badRequest("Expected JSON email, password and signup context");
      }
      if (registeredUsers.has(body.email)) {
        const user = registeredUsers.get(body.email)
        if (user.password !== body.password) {
          return new Response(403, {}, { errors: [{ detail: "Invalid credentials" }] })
        }
        return new Response(200, {}, publicUser(user, body.signup))
      }
      const id = uuid()
      const user = {
        id,
        email: body.email,
        emailVerified: false,
        password: body.password,
        refreshToken: `${id}_refresh_token`,
      }
      deletedEmails.delete(body.email)
      registeredUsers.set(body.email, user)
      return new Response(201, {}, publicUser(user, body.signup));
    });

    server.post(config.AUTH_URL + "/reset-password", (schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      const user = registeredUsers.get(body.email) ?? schema.users.findBy({ email: body.email })
      if (user) newActionToken("passwordReset", user.id, body.email)
      return statusOk();
    });

    server.post(config.AUTH_URL + "/change-password", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.token || !body?.password) {
        return badRequest("Expected JSON token and password");
      }
      const action = consumeActionToken(body.token, ["passwordReset"])
      if (!action) {
        return badRequest("Invalid or expired token")
      }
      const user = [...registeredUsers.values()].find(candidate => candidate.id === action.userId)
      if (user) {
        user.password = body.password
      }
      return statusOk();
    });

    server.post(config.AUTH_URL + "/change-email", (schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      const accessToken = request.requestHeaders.Authorization?.split(" ")[1]
      const user = accessToken ? getMockAuthUser(accessToken) : undefined
      newActionToken("emailChange", user?.id ?? schema.users.first().id, body.email);
      return statusOk();
    });

    server.post(config.AUTH_URL + "/email/confirm", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.token) {
        return badRequest("Expected JSON token");
      }
      const action = actionTokens.get(body.token)
      if (!action || !["emailChange", "emailVerification"].includes(action.purpose)) {
        return badRequest("Invalid or expired token")
      }
      if (action.used && action.purpose !== "emailVerification") {
        return badRequest("Invalid or expired token")
      }
      if (!action.used) {
        consumeActionToken(body.token, [action.purpose])
      }
      const registered = [...registeredUsers.entries()].find(([, candidate]) => candidate.id === action.userId)
      if (registered) {
        const [previousEmail, user] = registered
        registeredUsers.delete(previousEmail)
        user.email = action.email
        user.emailVerified = true
        registeredUsers.set(user.email, user)
        return new Response(200, {}, publicUser(user, action.signup))
      }
      return new Response(200, {}, {
        id: action.userId,
        email: action.email,
        emailVerified: true
      });
    });

    server.post(config.AUTH_URL + "/resend-validation", (schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      const user = registeredUsers.get(body.email)
      const signup = user ? latestEmailVerification(user.id)?.[1].signup : undefined
      newActionToken("emailVerification", user?.id ?? schema.users.first().id, body.email, signup);
      return statusOk();
    });

    server.post(config.AUTH_URL + "/action-token", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.userId || !body?.purpose || !["passwordReset", "emailChange", "emailVerification", "unsubscribe"].includes(body.purpose)) {
        return badRequest("Invalid action token request");
      }
      const registered = registeredUsers.get(body.userId)
        ?? [...registeredUsers.values()].find(user => user.id === body.userId)
      const userId = registered?.id ?? body.userId
      const email = body.email ?? registered?.email ?? "test@example.com";
      if (body.purpose === "emailVerification") {
        const signup = body.signup ?? latestEmailVerification(userId)?.[1].signup
        return new Response(200, {}, {
          token: newActionToken(body.purpose, userId, email, signup),
          email
        })
      }
      return new Response(200, {}, { token: newActionToken(body.purpose, userId, email), email });
    });

    server.post(config.AUTH_URL + "/redeem-action-token", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.token || body.purpose !== "unsubscribe") {
        return badRequest("Invalid redeem action token request");
      }
      const record = redeemMockActionToken(body.token, "unsubscribe");
      return record
        ? new Response(200, {}, { userId: record.userId, email: record.email, purpose: record.purpose })
        : badRequest("Invalid or expired action token");
    });
  }
};
