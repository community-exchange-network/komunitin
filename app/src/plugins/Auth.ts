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
  code?: string;
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpire: Date;
  scopes: string[];
}

/**
 * Implements OAuth2 client with the features:
 *  - `Resource Owner Password` flow for direct login with email & password.
 *  - Refresh credentials through refresh tokens.
 *  - OIDC social login with Google and Facebook (TODO)
 */
export class Auth {
  public static readonly STORAGE_KEY: string = "auth-session";
  public static readonly SCOPES = "komunitin_social komunitin_accounting email offline_access openid profile";
  public static readonly AUTH_SCOPE = "komunitin_auth";
  public static readonly SUPERADMIN_SCOPE = "komunitin_superadmin";

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
  public async login({email, password, superadmin = false}: {email: string, password: string, superadmin?: boolean}): Promise<AuthData> {
    const tokens = await this.tokenRequest({
      username: email,
      password: password,
      grant_type: "password",
      scope: Auth.SCOPES + (superadmin ? " " + Auth.SUPERADMIN_SCOPE : "")
    });

    return tokens;
  }

  /**
   * 
   * @param 
   */
  public async authorizeWithCode(code: string): Promise<AuthData> {
    const tokens = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      scope: Auth.SCOPES + " " + Auth.AUTH_SCOPE
    });

    return tokens;
  }

  public async resetPassword(email: string): Promise<void> {
    const params = new URLSearchParams(); 
    params.append("email", email);
    params.append("client_id", this.clientId);

    const response = await fetch(this.resetPasswordEndpoint, {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    this.checkResponse(response)
  }

  public async resendValidationEmail(email: string, code: string): Promise<void> {
    const params = new URLSearchParams()
    params.append("email", email)
    params.append("client_id", this.clientId)
    params.append("group", code)

    const response = await fetch(config.AUTH_URL + "/resend-validation", {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    })

    this.checkResponse(response)
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
  private checkResponse(response: Response) {
    if (!response.ok) {
      if (response.status == 401) {
        throw new KError(
          KErrorCode.AuthNoCredentials,
          "Missing or invalid credentials",
          undefined,
          response
        );
      } else if (response.status == 403) {
        throw new KError(
          KErrorCode.IncorrectCredentials,
          "Access forbidden with given credentials",
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
      this.checkResponse(response)
      const data = await response.json();
      return this.processTokenResponse(data);
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
  public processTokenResponse(response: TokenResponse): AuthData {
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
    LocalStorage.set(Auth.STORAGE_KEY, data);

    return data;
  }
}
