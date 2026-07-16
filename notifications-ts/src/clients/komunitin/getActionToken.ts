import { config } from '../../config';
import { AuthProvider } from './AuthProvider';
import logger from '../../utils/logger';
import type { SignupContext } from '../../notifications/events';

export type ActionTokenRequest =
  | { purpose: 'passwordReset' | 'unsubscribe' }
  | { purpose: 'emailChange'; email: string }
  | { purpose: 'emailVerification'; signup?: SignupContext };

export async function getActionToken(userId: string, request: ActionTokenRequest): Promise<string> {
  const accessToken = await AuthProvider.getInstance().getAccessToken();

  try {
    const response = await fetch(`${config.KOMUNITIN_AUTH_URL}/action-token`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, ...request }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get action token: ${response.status} ${text}`);
    }

    const data = await response.json() as { token: string };
    return data.token;
  } catch (error) {
    logger.error({ err: error, userId, purpose: request.purpose }, 'Failed to get action token');
    throw error;
  }
}

export const getUnsubscribeToken = (userId: string) => {
  return getActionToken(userId, { purpose: 'unsubscribe' });
};
