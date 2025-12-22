import { config } from '../config';
import logger from '../utils/logger';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export class AuthProvider {
  private static instance: AuthProvider;
  private accessToken: string | null = null;
  private expiresAt: number = 0;
  private refreshPromise: Promise<string> | null = null;

  private constructor() { }

  public static getInstance(): AuthProvider {
    if (!AuthProvider.instance) {
      AuthProvider.instance = new AuthProvider();
    }
    return AuthProvider.instance;
  }

  public async getAccessToken(): Promise<string> {
    // Return existing token if valid (with 60s buffer)
    if (this.accessToken && Date.now() < this.expiresAt - 60000) {
      return this.accessToken;
    }

    // Deduplicate refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchNewToken();
    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async fetchNewToken(): Promise<string> {
    logger.info('Fetching new access token...');

    // Prepare request body for client_credentials flow
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.NOTIFICATIONS_CLIENT_ID);
    params.append('client_secret', config.NOTIFICATIONS_CLIENT_SECRET);
    params.append('scope', 'komunitin_social_read_all komunitin_accounting_read_all');

    try {
      const response = await fetch(`${config.KOMUNITIN_AUTH_URL}/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Auth failed: ${response.status} ${text}`);
      }

      const data = await response.json() as TokenResponse;

      this.accessToken = data.access_token;
      // expires_in is in seconds
      this.expiresAt = Date.now() + (data.expires_in * 1000);

      logger.info({ expiresIn: data.expires_in }, 'Token refreshed successfully');

      return this.accessToken;
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch access token');
      throw error;
    }
  }

  public forceRefresh(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }
}
