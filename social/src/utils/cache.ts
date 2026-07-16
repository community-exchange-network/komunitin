export type CacheValue<Value> = {
  value: Value
  expiresAt: number
}

/**
 * Bounded LRU cache that coalesces concurrent loads for the same key.
 */
export class AsyncCache<Key, Value> {
  private readonly values = new Map<Key, CacheValue<Value>>()
  private readonly pending = new Map<Key, Promise<CacheValue<Value>>>()

  constructor(private readonly maxEntries: number) {}

  public async getOrLoad(
    key: Key,
    load: () => Promise<CacheValue<Value>>,
  ): Promise<Value> {
    const cached = this.values.get(key)
    if (cached) {
      if (cached.expiresAt > Date.now()) {
        this.values.delete(key)
        this.values.set(key, cached)
        return cached.value
      }
      this.values.delete(key)
    }

    const pending = this.pending.get(key)
    if (pending) {
      return (await pending).value
    }

    const loading = load()
    this.pending.set(key, loading)

    try {
      const loaded = await loading
      if (loaded.expiresAt > Date.now()) {
        this.values.set(key, loaded)
        if (this.values.size > this.maxEntries) {
          this.values.delete(this.values.keys().next().value!)
        }
      }
      return loaded.value
    } finally {
      if (this.pending.get(key) === loading) {
        this.pending.delete(key)
      }
    }
  }
}
