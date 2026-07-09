// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { config } from "src/utils/config";
import type { TokenResponse } from "../plugins/Auth";
import type { Server} from "miragejs";
import { Response } from "miragejs";
import { badRequest } from "./ServerUtils";

type ActionTokenPurpose = "passwordReset" | "emailChange" | "emailVerification" | "unsubscribe";

const actionTokens = new Map<string, { purpose: ActionTokenPurpose, userId: string, email: string, used?: boolean }>();

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

function newActionToken(purpose: ActionTokenPurpose, userId: string, email: string) {
  const token = `${purpose}-${actionTokens.size + 1}`;
  actionTokens.set(token, { purpose, userId, email });
  return token;
}

function consumeActionToken(token: string, purposes: ActionTokenPurpose[]) {
  const record = actionTokens.get(token);
  if (!record || record.used || !purposes.includes(record.purpose)) {
    return undefined;
  }
  record.used = true;
  return record;
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
        const data = mockToken(params.get("scope"), param === "empty_user");
        return new Response(200, {}, data);
      }
    );

    server.post(config.AUTH_URL + "/register", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email || !body?.password) {
        return badRequest("Expected JSON email and password");
      }
      newActionToken("emailVerification", "test_user", body.email);
      return new Response(201, {}, { status: "ok" });
    });

    server.post(config.AUTH_URL + "/reset-password", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      newActionToken("passwordReset", "test_user", body.email);
      return statusOk();
    });

    server.post(config.AUTH_URL + "/change-password", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.token || !body?.password) {
        return badRequest("Expected JSON token and password");
      }
      return consumeActionToken(body.token, ["passwordReset"]) ? statusOk() : badRequest("Invalid or expired token");
    });

    server.post(config.AUTH_URL + "/change-email", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      newActionToken("emailChange", "test_user", body.email);
      return statusOk();
    });

    server.post(config.AUTH_URL + "/change-email/confirm", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.token) {
        return badRequest("Expected JSON token");
      }
      return consumeActionToken(body.token, ["emailChange", "emailVerification"]) ? statusOk() : badRequest("Invalid or expired token");
    });

    server.post(config.AUTH_URL + "/resend-validation", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.email) {
        return badRequest("Expected JSON email");
      }
      newActionToken("emailVerification", "test_user", body.email);
      return statusOk();
    });

    server.post(config.AUTH_URL + "/action-token", (_schema: any, request) => {
      const body = jsonBody(request);
      if (!body?.userId || !body?.purpose || !["passwordReset", "emailChange", "emailVerification", "unsubscribe"].includes(body.purpose)) {
        return badRequest("Invalid action token request");
      }
      const email = body.email ?? "test@example.com";
      return new Response(200, {}, { token: newActionToken(body.purpose, body.userId, email), email });
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
