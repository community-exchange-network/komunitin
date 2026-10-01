import assert from 'node:assert/strict'
import test from 'node:test'
import { AsyncCache, type CacheValue } from '../../src/utils/cache'

test('caches loaded values until they expire', async (t) => {
  let now = 1_000
  let loads = 0
  const cache = new AsyncCache<string, string>(2)
  t.mock.method(Date, 'now', () => now)

  const load = async (): Promise<CacheValue<string>> => {
    loads++
    return { value: `value-${loads}`, expiresAt: now + 100 }
  }

  assert.strictEqual(await cache.getOrLoad('key', load), 'value-1')
  assert.strictEqual(await cache.getOrLoad('key', load), 'value-1')

  now += 100
  assert.strictEqual(await cache.getOrLoad('key', load), 'value-2')
  assert.strictEqual(loads, 2)
})

test('shares the same load promise between concurrent calls', async () => {
  let loads = 0
  let resolveLoad!: (value: CacheValue<string>) => void
  const loaded = new Promise<CacheValue<string>>((resolve) => {
    resolveLoad = resolve
  })
  const cache = new AsyncCache<string, string>(2)
  const load = () => {
    loads++
    return loaded
  }

  const first = cache.getOrLoad('key', load)
  const second = cache.getOrLoad('key', load)

  assert.strictEqual(loads, 1)
  resolveLoad({ value: 'shared-value', expiresAt: Date.now() + 1000 })
  assert.deepStrictEqual(await Promise.all([first, second]), ['shared-value', 'shared-value'])
})

test('removes failed loads and never falls back to expired values', async (t) => {
  let now = 1_000
  let loads = 0
  const cache = new AsyncCache<string, string>(2)
  t.mock.method(Date, 'now', () => now)

  assert.strictEqual(
    await cache.getOrLoad('key', async () => ({ value: 'old', expiresAt: now + 100 })),
    'old',
  )

  now += 100
  const fail = async (): Promise<CacheValue<string>> => {
    loads++
    throw new Error('load failed')
  }
  const first = cache.getOrLoad('key', fail)
  const second = cache.getOrLoad('key', fail)

  const results = await Promise.allSettled([first, second])
  assert.deepStrictEqual(results.map(({ status }) => status), ['rejected', 'rejected'])
  assert.strictEqual(loads, 1)

  assert.strictEqual(
    await cache.getOrLoad('key', async () => ({ value: 'new', expiresAt: now + 100 })),
    'new',
  )
})

test('evicts the least-recently-used value when full', async () => {
  let loads = 0
  const cache = new AsyncCache<string, string>(2)
  const load = async (value: string): Promise<CacheValue<string>> => {
    loads++
    return { value, expiresAt: Date.now() + 1000 }
  }

  await cache.getOrLoad('a', () => load('a'))
  await cache.getOrLoad('b', () => load('b'))
  await cache.getOrLoad('a', () => load('unexpected'))
  await cache.getOrLoad('c', () => load('c'))

  assert.strictEqual(await cache.getOrLoad('a', () => load('unexpected')), 'a')
  assert.strictEqual(await cache.getOrLoad('b', () => load('reloaded-b')), 'reloaded-b')
  assert.strictEqual(loads, 4)
})
