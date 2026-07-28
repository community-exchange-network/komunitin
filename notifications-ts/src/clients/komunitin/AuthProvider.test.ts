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
    auth.invalidate();

    const token = await auth.getAccessToken();

    assert.strictEqual(token, 'test-token');
    // Check if fetch was called with correct URL
    const call = (global.fetch as any).mock.calls[0];
    // URL should match .env.test value
    assert.strictEqual(call.arguments[0], 'http://auth.test/token');
    assert.strictEqual(call.arguments[1].body.get('scope'), 'email social:read accounting:read');
  });

  it('should reuse valid token', async () => {
    const auth = AuthProvider.getInstance();

    // This should return the cached token without calling fetch
    const token = await auth.getAccessToken();

    assert.strictEqual(token, 'test-token');
    // Fetch call count should still be 1 from previous test
    assert.strictEqual((global.fetch as any).mock.callCount(), 1);
  });

  it('should deduplicate concurrent token refreshes', async () => {
    global.fetch = mock.fn(async () => new Response(JSON.stringify({
      access_token: 'shared-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'all'
    })));
    const auth = AuthProvider.getInstance();
    auth.invalidate();

    const tokens = await Promise.all([
      auth.getAccessToken(),
      auth.getAccessToken(),
      auth.getAccessToken(),
    ]);

    assert.deepStrictEqual(tokens, ['shared-token', 'shared-token', 'shared-token']);
    assert.strictEqual((global.fetch as any).mock.callCount(), 1);
  });
});
