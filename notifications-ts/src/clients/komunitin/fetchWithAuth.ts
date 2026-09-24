import logger from '../../utils/logger';
import { AuthProvider } from './AuthProvider';

export async function fetchWithRetry(url: string, options: RequestInit = {}) {
  const maxAttempts = 3;
  let attempt = 1;

  while (true) {
    try {
      return await fetch(url, options);
    } catch (error) {
      const retryable = error instanceof Error && (error.message.includes('fetch failed') || error.message.includes('other side closed'));
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      logger.warn({ err: error.message, attempt }, 'Network error, retrying');
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      attempt++;
    }
  }
}

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const auth = AuthProvider.getInstance();
  const request = async () => {
    const token = await auth.getAccessToken();
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetchWithRetry(url, {
      ...options,
      headers,
    });
    return { response, token };
  };

  let result = await request();
  if (result.response.status === 401) {
    logger.warn({ url }, 'Received 401, refreshing token and retrying');
    auth.invalidate(result.token);
    result = await request();
  }

  if (!result.response.ok) {
    const status = [result.response.status, result.response.statusText].filter(Boolean).join(' ');
    throw new Error(`${url} request failed: ${status}`);
  }

  return result.response;
}
