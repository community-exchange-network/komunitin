import { config } from "src/utils/config";
import KError, { KErrorCode } from "src/KError";
//https://quasar.dev/quasar-plugins/web-storage

import LocalStorage from "./LocalStorage";


export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_in: number;
}

interface TokenRequestData {
  grant_type: string;
  client_id?: string;
  username?: string;
  password?: string;
  scope?: string;
  refresh_token?: string;
}

interface OAuthErrorResponse {
  error: string
  error_description: string
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpire: Date;
  scopes: string[];
}

export type SignupContext = {
  name: string
  language: string
} & (
  | { type: "group" }
  | { type: "member", groupCode: string }
)

export interface ConfirmedAuthUser {
  id: string
  email: string
  emailVerified: true
  signup?: SignupContext
}

/**
 * Implements OAuth2 client with the features:
 *  - `Resource Owner Password` flow for direct login with email & password.
 *  - Refresh credentials through refresh tokens.
 *  - OIDC social login with Google and Facebook (TODO)
 */
export class Auth {
  public static readonly STORAGE_KEY: string = "auth-session";
  public static readonly SUPERADMIN_SCOPE = "superadmin";
  public static readonly SCOPES = `email offline_access social:read social:write accounting:read accounting:write ${Auth.SUPERADMIN_SCOPE}`;

  private readonly tokenEndpoint: string;
  private readonly resetPasswordEndpoint: string;
  private readonly clientId: string;

  constructor() {
    this.tokenEndpoint = config.AUTH_URL + "/token";
    this.resetPasswordEndpoint = config.AUTH_URL + "/reset-password"
    this.clientId = config.OAUTH_CLIENTID
  }

  /**
   * Retrieve AuthData stored in LocalStorage.
   */
  public async getStoredTokens(): Promise<AuthData | undefined> {
    const data = await LocalStorage.getItem(Auth.STORAGE_KEY)
    if (data !== null) {
      data.accessTokenExpire = new Date(data.accessTokenExpire);
      return data as AuthData;
    }
    return undefined;
  }
  /**
   * Do the necessary things to logout the user identified by given AuthData.
   * 
   * Actually, it just deletes the saved token but in future it could do server
   * side operations.
   */
  public async logout() {
    if (await LocalStorage.has(Auth.STORAGE_KEY)) {
      await LocalStorage.remove(Auth.STORAGE_KEY);
    }
  }
  /**
   * Returns whether this class contains sufficient authorization information.
   */
  public isAuthorized(tokens: AuthData | undefined): boolean {
    return (
      tokens !== undefined &&
      tokens.accessTokenExpire.getTime() > new Date().getTime()
    );
  }

  /**
   * Try to silently authorize it using stored refresh token.
   * If can't suceed it rejects the promise (throws exception).
   * 
   * @param force If true, it will try to refresh the access token even
   * if the current one is still valid.
   */
  public async authorize(tokens?: AuthData, force = false): Promise<AuthData> {
    // 1. Maybe we're already authorized.
    if (!force && this.isAuthorized(tokens)) {
      return tokens
    }
    // 2. Maybe we can use the refresh token.
    if (tokens != undefined) {
      try {
        tokens = await this.refresh(tokens)
        return tokens
      } catch (error)  {
        if (!(error instanceof KError && error.code == KErrorCode.AuthNoCredentials)) {
          // This is an unexpected error, including network error, 400, 403, or 5XX response, 
          throw error
        }
      }
    }
    // 3. At this point we could try to use the Credentials Management API, but
    // I finally have not done it due to lack of cross-browser compatibility.
    throw new KError(KErrorCode.AuthNoCredentials, "Missing credentials.");
  }

  /**
   * Perform 2-legged authorization using user email and password.
   *
   * @param email The user email
   * @param password The user password
   */
  public async login({email, password}: {email: string, password: string}): Promise<AuthData> {
    const tokens = await this.tokenRequest({
      username: email,
      password: password,
      grant_type: "password",
      scope: Auth.SCOPES
    });

    return tokens;
  }

  public async resetPassword(email: string): Promise<void> {
    await this.jsonRequest(this.resetPasswordEndpoint, { email })
  }

  public async register(email: string, password: string, signup: SignupContext): Promise<void> {
    await this.jsonRequest(config.AUTH_URL + "/register", { email, password, signup })
  }

  public async resendValidationEmail(email: string): Promise<void> {
    await this.jsonRequest(config.AUTH_URL + "/resend-validation", { email })
  }

  public async changePassword(token: string, password: string): Promise<void> {
    await this.jsonRequest(config.AUTH_URL + "/change-password", { token, password })
  }

  public async changeAuthenticatedPassword(currentPassword: string, password: string, accessToken: string): Promise<void> {
    await this.jsonRequest(
      config.AUTH_URL + "/change-password/authenticated",
      { currentPassword, password },
      accessToken
    )
  }

  public async changeEmail(email: string, accessToken: string): Promise<void> {
    await this.jsonRequest(config.AUTH_URL + "/change-email", { email }, accessToken)
  }

  public async confirmEmail(token: string): Promise<ConfirmedAuthUser> {
    return await this.jsonRequest<ConfirmedAuthUser>(config.AUTH_URL + "/change-email/confirm", { token })
  }

  /**
   * Authenticate using external OpenID Connect provider.
   */
  public async authenticate(provider: "google" | "facebook"): Promise<void> {
    throw new KError(
      KErrorCode.NotImplemented,
      "Authentication with " + provider + "not implemented yet"
    );
  }

  /**
   * Throws KError if the response is not OK.
   * @param response 
   */
  private async checkResponse(response: Response) {
    if (!response.ok) {
      if (response.status == 401) {
        throw new KError(
          KErrorCode.AuthNoCredentials,
          "Missing or invalid credentials",
          undefined,
          response
        );
      } else if (response.status == 400) {
        const oauthError = await response.clone().json() as OAuthErrorResponse
        if (oauthError.error === "invalid_grant") {
          throw new KError(
            KErrorCode.IncorrectCredentials,
            oauthError.error_description,
            undefined,
            response
          )
        }
        throw new KError(
          KErrorCode.IncorrectRequest,
          "Invalid request",
          undefined,
          response
        )
      } else if (response.status == 403) {
        throw new KError(
          KErrorCode.IncorrectCredentials,
          "Access forbidden with given credentials",
          undefined,
          response
        );
      } else if (response.status == 409) {
        throw new KError(
          KErrorCode.DuplicatedEmail,
          "Email already registered",
          undefined,
          response
        );
      } else if (400 <= response.status && response.status < 500) {
        throw new KError(
          KErrorCode.IncorrectRequest,
          "Invalid request",
          undefined,
          response
        );
      } else {
        throw new KError(KErrorCode.ServerBadResponse, `Server error ${response.status}`, undefined, {error: response.statusText});
      }
    }
  }

  private async jsonRequest<T = void>(
    url: string,
    body?: Record<string, unknown>,
    accessToken?: string
  ): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
      }
    })
    await this.checkResponse(response)
    return await response.json() as T
  }

  /**
   * Get new access token using saved refresh token.
   */
  private async refresh(tokens: AuthData): Promise<AuthData> {
    if (!tokens) {
      // Should never happen, as callers must be sure that this.data is set.
      throw new KError(KErrorCode.Unknown, "Missing authentication data.");
    }
    return await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refreshToken
    });
  }

  /**
   * Perform a request to /token OAuth2 endpoint.
   * @param data The data to be sent. client_id is set automatically.
   */
  private async tokenRequest(data: TokenRequestData): Promise<AuthData> {
    data.client_id = this.clientId;
    // Use URLSearchParams in order to send the request with x-www-urlencoded.
    const params = new URLSearchParams();
    Object.entries(data).forEach(([key, value]) => params.append(key, value));
    try {
      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        body: params,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      });
      await this.checkResponse(response)
      const tokenResponse = await response.json();
      return await this.processTokenResponse(tokenResponse);
    } catch (error) {
      throw KError.getKError(error);
    }
  }

  /**
   * Handle the response of a request to /token OAuth2 endpoint
   * @param response The response.
   * 
   * Public function just for testing purposes.
   */
  public async processTokenResponse(response: TokenResponse): Promise<AuthData> {
    // Set data object from response.
    const expire = new Date();
    expire.setSeconds(expire.getSeconds() + Number(response.expires_in));

    const data = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      accessTokenExpire: expire,
      scopes: response.scope.split(" ")
    };

    // Save data state.
    await LocalStorage.set(Auth.STORAGE_KEY, data);

    return data;
  }
}
