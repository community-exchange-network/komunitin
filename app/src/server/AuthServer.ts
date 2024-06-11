// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { KOptions } from "../boot/koptions";
import { TokenResponse } from "../plugins/Auth";
import { Server, Response } from "miragejs";

export function mockToken(scope: string, emptyUser = false): TokenResponse {
  return {
    access_token: emptyUser ? "empty_user_access_token" : "test_user_access_token",
    refresh_token: emptyUser ? "empty_user_refresh_token" : "test_user_refresh_token",
    expires_in: 3600,
    scope: scope
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
      KOptions.url.auth + "/token",
      (schema: any, request) => {
        const params = new URLSearchParams(request.requestBody);
        const param = params.get("code") || params.get("refresh_token") || params.get("username") || "test_user";
        const data = mockToken(params.get("scope") as string, param === "empty_user");
        return new Response(200, {}, data);
      }
    );
  }
};
