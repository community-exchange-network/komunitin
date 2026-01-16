import { describe, it, mock, afterEach, beforeEach, before } from 'node:test';
import assert from 'node:assert';
import { mockRedis } from '../../mocks/redis';

// Set up redis mocking before imports that use redis
const { mocks: redisMocks, reset } = mockRedis();


describe('Cache Service', () => {

  let cache: any;

  before(async () => {
    const cacheModule = await import('../cache');
    cache = cacheModule.cache
  });

  beforeEach(() => {
    redisMocks.getMock.mock.resetCalls();
    redisMocks.setMock.mock.resetCalls();
    reset()
  });

  it('should fetch data when cache is empty', async () => {
    const fetcher = mock.fn(async () => 'value');
    const result = await cache.get('test:key', fetcher, 1000);

    assert.strictEqual(result, 'value');
    assert.strictEqual(fetcher.mock.callCount(), 1);
  });

  it('should return cached data if valid', async () => {
    const fetcher = mock.fn(async () => 'value');

    // First call to populate cache
    await cache.get('test:key', fetcher, 1000);

    // Second call should hit cache
    const result = await cache.get('test:key', fetcher, 1000);

    assert.strictEqual(result, 'value');
    assert.strictEqual(fetcher.mock.callCount(), 1); // Helper called only once
  });

  it('should deduplicate simultaneous requests', async () => {
    let resolveFetcher: (value: string) => void;
    const fetcherPromise = new Promise<string>((resolve) => {
      resolveFetcher = resolve;
    });
    const fetcher = mock.fn(() => fetcherPromise);

    const promise1 = cache.get('test:key', fetcher, 1000);
    const promise2 = cache.get('test:key', fetcher, 1000);

    resolveFetcher!('value');

    const [result1, result2] = await Promise.all([promise1, promise2]);

    assert.strictEqual(result1, 'value');
    assert.strictEqual(result2, 'value');
    assert.strictEqual(fetcher.mock.callCount(), 1);
  });

  it('should force refresh', async () => {
    const fetcher = mock.fn(async () => 'value');

    await cache.get('test:key', fetcher, 1000);
    await cache.get('test:key', fetcher, 1000, true); // Force

    assert.strictEqual(fetcher.mock.callCount(), 2);
  });

  it('should ignore expired logical TTL but still respect physical TTL', async () => {
    // Simulate expired logical TTL but present physically
    const cachedValue = JSON.stringify({
      data: 'old_value',
      timestamp: Date.now() - 2000
    });
    redisMocks.getMock.mock.mockImplementationOnce(async () => cachedValue);

    const fetcher = mock.fn(async () => 'new_value');
    const result = await cache.get('test:key', fetcher, 1000); // 1s logical TTL

    assert.strictEqual(result, 'new_value');
    assert.strictEqual(fetcher.mock.callCount(), 1);
  });
});
