import { after, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { AuthProvider } from './AuthProvider';
import { fetchWithAuth } from './fetchWithAuth';

describe('fetchWithAuth', () => {
  let originalFetch: typeof global.fetch;
  let tokenNumber: number;

  before(() => {
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    tokenNumber = 0;
    AuthProvider.getInstance().invalidate();
  });

  after(() => {
    global.fetch = originalFetch;
  });

  it('refreshes and retries exactly once after a 401', async () => {
    const authorizations: string[] = [];
    global.fetch = mock.fn(async (input: string | URL | Request, options?: RequestInit) => {
      if (input.toString().endsWith('/token')) {
        tokenNumber++;
        return new Response(JSON.stringify({
          access_token: `token-${tokenNumber}`,
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'all',
        }));
      }
      authorizations.push(new Headers(options?.headers).get('Authorization') ?? '');
      return new Response(null, { status: authorizations.length === 1 ? 401 : 200 });
    });

    const response = await fetchWithAuth('http://social.test/groups');

    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(authorizations, ['Bearer token-1', 'Bearer token-2']);
    assert.strictEqual((global.fetch as any).mock.callCount(), 4);
  });
});
