import { config } from '../../config';
import { fetchWithAuth } from './fetchWithAuth';
import type { SignupContext } from '../../notifications/events';

export type ActionTokenRequest =
  | { purpose: 'memberDeletion'; memberId: string }
  | { purpose: 'passwordReset' | 'unsubscribe' }
  | { purpose: 'emailChange'; email: string }
  | { purpose: 'emailVerification'; signup?: SignupContext };

export async function getActionToken(userId: string, request: ActionTokenRequest) {
  const response = await fetchWithAuth(`${config.KOMUNITIN_AUTH_URL}/action-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ...request }),
  });
  return await response.json() as { token: string; email: string };
}

export const getUnsubscribeToken = async (userId: string) => {
  const { token } = await getActionToken(userId, { purpose: 'unsubscribe' });
  return token;
};
