import { config } from '../../config';
import { AuthProvider } from './AuthProvider';
import logger from '../../utils/logger';

/**
 * Get a temporary user token for unsubscribe links
 * This token has limited scope (komunitin_social) and is used for one-click unsubscribe
 * 
 * @param scopes Optional scopes to request for the token. If not provided, the default scopes
 * will be used, which include permissions to login to the app. For unsubscribe links, we only
 * need the 'komunitin_social' scope.
 */
export async function getAuthCode(userId: string, scopes?: string[]): Promise<string> {
  const authProvider = AuthProvider.getInstance();
  const accessToken = await authProvider.getAccessToken();

  const params = new URLSearchParams();
  params.append('user_id', userId);
  if (scopes) {
    params.append('scope', scopes.join(' '));
  }

  try {
    const response = await fetch(`${config.KOMUNITIN_AUTH_URL}/get-auth-code`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get user token: ${response.status} ${text}`);
    }

    const data = await response.json() as { code: string };
    return data.code;
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to get user token');
    throw error;
  }
}
