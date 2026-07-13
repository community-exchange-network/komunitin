// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "src/utils/config";
import type { SignupContext, TokenResponse } from "../plugins/Auth";
import type { Server} from "miragejs";
import { Response } from "miragejs";
import { badRequest } from "./ServerUtils";
import { v4 as uuid } from "uuid";

type ActionTokenPurpose = "passwordReset" | "emailChange" | "emailVerification" | "unsubscribe";

type ActionToken = {
  purpose: ActionTokenPurpose
  userId: string
  email: string
  signup?: SignupContext
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

export function getMockAuthUser(accessToken: string) {
  return accessTokenUsers.get(accessToken)
}

function statusOk() {
  return new Response(200, {}, { status: "ok" });
}

function jsonBody(request: any) {
  const contentType = request.requestHeaders["Content-Type"] ?? request.requestHeaders["content-type"] ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  return JSON.parse(request.requestBody || "{}");
}

function newActionToken(purpose: ActionTokenPurpose, userId: string, email: string, signup?: SignupContext) {
  const token = `${purpose}-${actionTokens.size + 1}`;
  actionTokens.set(token, { purpose, userId, email, signup });
  return token;
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
  return consumeActionToken(token, [purpose]);
}

export function mockToken(scope: string | null, emptyUser = false): TokenResponse & { token_type: "Bearer" } {
  return {
    access_token: emptyUser ? "empty_user_access_token" : "test_user_access_token",
    refresh_token: emptyUser ? "empty_user_refresh_token" : "test_user_refresh_token",
    expires_in: 3600,
    token_type: "Bearer",
    scope: scope ?? "",
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
        const param = params.get("refresh_token") || params.get("username") || "test_user";
        const registered = registeredUsers.get(param)
          ?? [...registeredUsers.values()].find(user => user.refreshToken === param)
        if (registered) {
          if (params.get("grant_type") === "password" && registered.password !== params.get("password")) {
            return new Response(403, {}, { errors: [{ detail: "Invalid credentials" }] })
          }
          if (!registered.emailVerified) {
            return new Response(403, {}, { errors: [{ detail: "Email is not verified" }] })
          }
          const accessToken = `${registered.id}_access_token`
          accessTokenUsers.set(accessToken, registered)
          return new Response(200, {}, {
            ...mockToken(params.get("scope")),
            access_token: accessToken,
            refresh_token: registered.refreshToken
          })
        }
        const data = mockToken(params.get("scope"), param === "empty_user");
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
      registeredUsers.set(body.email, user)
      return new Response(201, {}, publicUser(user, body.signup));
    });

    server.post(config.AUTH_URL + "/reset-password", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      const user = registeredUsers.get(body.email)
      newActionToken("passwordReset", user?.id ?? "test_user", body.email);
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

    server.post(config.AUTH_URL + "/change-password/authenticated", (_schema: any, request) => {
      const body = jsonBody(request);
      const accessToken = request.requestHeaders.Authorization?.split(" ")[1];
      if (!accessToken || !body?.currentPassword || !body?.password) {
        return badRequest("Expected bearer auth and JSON currentPassword and password");
      }
      if (body.currentPassword === "incorrect") {
        return new Response(403, {}, { errors: [{ detail: "Current password is incorrect" }] });
      }
      const user = accessTokenUsers.get(accessToken)
      if (user) {
        if (user.password !== body.currentPassword) {
          return new Response(403, {}, { errors: [{ detail: "Current password is incorrect" }] });
        }
        user.password = body.password
      }
      return statusOk();
    });

    server.post(config.AUTH_URL + "/change-email", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      const accessToken = request.requestHeaders.Authorization?.split(" ")[1]
      const user = accessToken ? accessTokenUsers.get(accessToken) : undefined
      newActionToken("emailChange", user?.id ?? "test_user", body.email);
      return statusOk();
    });

    server.post(config.AUTH_URL + "/change-email/confirm", (_schema: any, request) => {
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

    server.post(config.AUTH_URL + "/resend-validation", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      const user = registeredUsers.get(body.email)
      const signup = user ? latestEmailVerification(user.id)?.[1].signup : undefined
      newActionToken("emailVerification", user?.id ?? "test_user", body.email, signup);
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
      const record = consumeActionToken(body.token, ["unsubscribe"]);
      return record
        ? new Response(200, {}, { userId: record.userId, email: record.email, purpose: record.purpose })
        : badRequest("Invalid or expired action token");
    });
  }
};
