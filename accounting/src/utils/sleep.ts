/**
 * Pause execution for some milliseconds (or a bit more).
 * @param milliseconds 
 * @returns 
 */
export const sleep = (milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds));

/**
 * Retry the execution of a function until it does not throw exception, following an exponential backoff strategy.
 * @param fn The function to execute.
 * @param timeoutMilliseconds The maximum time to retry.
 * @param startIntervalMilliseconds The initial time to wait before retrying (will be doubled each retry).
 * @returns The function outcome
 */
export const retry = async <T>(fn: () => Promise<T>, timeoutMilliseconds: number = 30000, startIntervalMilliseconds: number = 200, maxIntervalMilliseconds: number = 10000): Promise<T> => {
  try {
    return await fn()
  } catch (error) {
    if (timeoutMilliseconds <= 0) {
      throw error
    }
    await sleep(startIntervalMilliseconds)
    return await retry(fn, timeoutMilliseconds - startIntervalMilliseconds, Math.min(2 * startIntervalMilliseconds, maxIntervalMilliseconds), maxIntervalMilliseconds)
  }
}