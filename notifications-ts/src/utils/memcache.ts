export class MemCache<T> {
  private data: T | null = null;
  private lastFetchTime: number = 0;
  private pendingPromise: Promise<T> | null = null;

  /**
   * Get data from cache or fetch it if expired or forced.
   * Uses a pending promise to prevent multiple simultaneous fetches (cache stampede).
   * 
   * @param fetcher Function to fetch the data
   * @param ttl Time to live in milliseconds
   * @param force Force refresh the cache
   * @returns The data
   */
  async get(fetcher: () => Promise<T>, ttl: number, force: boolean = false): Promise<T> {
    const now = Date.now();
    const isExpired = !this.data || (now - this.lastFetchTime > ttl);

    // If we have valid data and not forced, return it
    if (!force && !isExpired) {
      return this.data!;
    }

    // If a fetch is already in progress, return the pending promise
    if (this.pendingPromise) {
      return this.pendingPromise;
    }

    // Start a new fetch
    this.pendingPromise = fetcher().then(
      (result) => {
        this.data = result;
        this.lastFetchTime = Date.now();
        this.pendingPromise = null;
        return result;
      },
      (error) => {
        this.pendingPromise = null;
        throw error;
      }
    );

    return this.pendingPromise;
  }
}
