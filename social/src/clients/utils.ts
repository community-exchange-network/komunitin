export const fetchWithRetry = async (input: string | URL | Request, init?: RequestInit, retries = 3, retryDelay = 1000): Promise<Response> => {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Don't retry aborted requests
      throw error
    }
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
      return fetchWithRetry(input, init, retries - 1, retryDelay * 2)
    }
    throw error
  }
}