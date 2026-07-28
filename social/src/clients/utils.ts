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

type BearerTokenProvider = (forceRefresh: boolean) => Promise<string>

/**
 * Fetch with a cached bearer token, refreshing it and retrying once when rejected.
 */
export const fetchWithAuth = async (
  input: string | URL | Request,
  init: RequestInit,
  getToken: BearerTokenProvider,
): Promise<Response> => {
  const request = async (forceRefresh: boolean) => {
    const headers = new Headers(init.headers)
    const token = await getToken(forceRefresh)
    headers.set('Authorization', `Bearer ${token}`)
    return fetchWithRetry(input, { ...init, headers })
  }

  let response = await request(false)
  if (response.status === 401) {
    response = await request(true)
  }
  return response
}
