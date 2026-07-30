import { config } from '../../config';
import { fetchWithAuth } from './fetchWithAuth';
import type { SignupContext } from '../../notifications/events';

export type ActionTokenRequest =
  | { purpose: 'passwordReset' | 'unsubscribe' }
  | { purpose: 'emailChange'; email: string }
  | { purpose: 'emailVerification'; signup?: SignupContext };

export async function getActionToken(userId: string, request: ActionTokenRequest): Promise<string> {
  const response = await fetchWithAuth(`${config.KOMUNITIN_AUTH_URL}/action-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...request }),
  });
  const data = await response.json() as { token: string };
  return data.token;
}

export const getUnsubscribeToken = (userId: string) => {
  return getActionToken(userId, { purpose: 'unsubscribe' });
};
