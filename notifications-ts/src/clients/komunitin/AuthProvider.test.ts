import { describe, it, mock, before, after } from 'node:test';
import assert from 'node:assert';
import { AuthProvider } from './AuthProvider';

describe('AuthProvider', () => {
  let originalFetch: typeof global.fetch;

  before(() => {
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  it('should fetch a new token when none exists', async () => {
    // Mock fetch response
    global.fetch = mock.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'all'
        })
      } as Response;
    });

    const auth = AuthProvider.getInstance();
    // Force refresh to clear any state
    auth.forceRefresh();

    const token = await auth.getAccessToken();

    assert.strictEqual(token, 'test-token');
    // Check if fetch was called with correct URL
    const call = (global.fetch as any).mock.calls[0];
    // URL should match .env.test value
    assert.strictEqual(call.arguments[0], 'http://auth.test/token');
  });

  it('should reuse valid token', async () => {
    const auth = AuthProvider.getInstance();

    // This should return the cached token without calling fetch
    const token = await auth.getAccessToken();

    assert.strictEqual(token, 'test-token');
    // Fetch call count should still be 1 from previous test
    assert.strictEqual((global.fetch as any).mock.callCount(), 1);
  });
});
