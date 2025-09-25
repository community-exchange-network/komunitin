import LocalStorage from "src/plugins/LocalStorage"
import KError, { KErrorCode } from "../KError";

export interface TokenService {
  /**
   * Get a valid access token, refreshing it if necessary.
   * @returns The access token, or null if there is no valid token (not logged in).
   */
  getAccessToken(): Promise<string | null>
  /**
   * Force refresh the access token using the refresh token.
   */
  refreshToken(): Promise<void>
}

export interface AuthService extends TokenService {
  isLoggedIn(): Promise<boolean>
  login(params: {email: string, password: string, superadmin?: boolean}): Promise<void>
  loginWithCode(params: {code: string}): Promise<void>
  logout(): Promise<void>
}

interface AuthData {
  accessToken: string;
  refreshToken: string;
  accessTokenExpire: Date;
  scopes: string[];
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

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_in: number;
}

export class AuthServiceImpl implements AuthService {

  private static readonly STORAGE_KEY: string = "auth-session";
  private static readonly SCOPES = "komunitin_social komunitin_accounting email offline_access openid profile";
  private static readonly AUTH_SCOPE = "komunitin_auth";
  private static readonly SUPERADMIN_SCOPE = "komunitin_superadmin";

  private data: AuthData | null = null

  constructor(
    private readonly tokenEndpoint: string,
    private readonly clientId: string
  ) {}
  
  public async login({email, password, superadmin = false}: {email: string, password: string, superadmin: boolean}) {
    const scopes = AuthServiceImpl.SCOPES + (superadmin ? " " + AuthServiceImpl.SUPERADMIN_SCOPE : "")
    this.tokenRequest({
      username: email,
      password: password,
      grant_type: "password",
      scope: scopes
    });
  }

  public async loginWithCode({code}:{code: string}) {
    await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      scope: AuthServiceImpl.SCOPES + " " + AuthServiceImpl.AUTH_SCOPE
    });
  }

  public async logout() {
    if (await LocalStorage.has(AuthServiceImpl.STORAGE_KEY)) {
      await LocalStorage.remove(AuthServiceImpl.STORAGE_KEY);
    }
    this.data = null;
  }

  private async tokenRequest(data: TokenRequestData) {
    data.client_id = this.clientId
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
      this.processTokenResponse(data);
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
  public processTokenResponse(response: TokenResponse) {
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
    LocalStorage.set(AuthServiceImpl.STORAGE_KEY, data);
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

  private async getStoredAuthData(): Promise<AuthData | null> {
    const stored = await LocalStorage.getItem(AuthServiceImpl.STORAGE_KEY);
    if (stored) {
      stored.accessTokenExpire = new Date(stored.accessTokenExpire);
      return stored as AuthData;
    }
    return null;
  }

  private async getData(): Promise<AuthData | null> {
    if (this.data === null) {
      this.data = await this.getStoredAuthData();
    }
    return this.data;
  }

  public async getAccessToken(): Promise<string | null> {
    const data = await this.getData();
    
    if (data === null) {
      return null;
    }
    
    if (data.accessTokenExpire.getTime() + 5*60*1000 < new Date().getTime()) {
      // Token expired (with 5 minutes margin), refresh it.
      await this.refreshToken();
      const data = await this.getData();
      return data ? data.accessToken : null;
    }

    return data.accessToken;
  }

  public async refreshToken(): Promise<void> {
    const data = await this.getData();
    if (data === null) {
      throw new KError(KErrorCode.AuthNoCredentials, "No refresh token available.");
    }
    await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: data.refreshToken
    });
  }

  public async isLoggedIn(): Promise<boolean> {
    const data = await this.getData();
    return data !== null && data.accessTokenExpire > new Date();
  }

}