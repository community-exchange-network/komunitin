import { useStore } from "vuex"
import {type ResourceObject, type SuccessfulResponse } from "../store/model"
import KError, { checkFetchResponse } from "../KError"

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: Record<string, unknown> | unknown[]
}

export interface AuthService {
  accessToken: () => string | undefined
  refresh: () => Promise<void>
}

/** Share authentication retries without consuming request or response bodies. */
const requestRaw = async (url: string, options: RequestInit, auth: AuthService) => {
  const doRequest = (accessToken: string | undefined) => fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
    }
  })
  try {
    const originalToken = auth.accessToken()
    let response = await doRequest(originalToken)
    if (!response.ok && response.status == 401) {
      const currentToken = auth.accessToken()
      if (originalToken && currentToken === originalToken) {
        // Refresh and retry
        await auth.refresh()
        response = await doRequest(auth.accessToken())
      } else if (currentToken) {
        // Authentication changed while awaiting the response, so use the new token directly.
        response = await doRequest(currentToken)
      }
    }
    // Throw error if response not ok
    await checkFetchResponse(response)
    return response
  } catch (error) {
    throw KError.getKError(error)
  }
}

/**
 * Use useApiFetch instead of this function if outside of the store.
 */
export const request = async <T extends ResourceObject> (url: string, options: FetchOptions = {}, auth: AuthService): Promise<SuccessfulResponse<T, ResourceObject> | null> => {
  try {
    const response = await requestRaw(url, {
      ...options,
      headers: {
        ...options.headers,
        'Accept': 'application/vnd.api+json',
        ...(options.body ? { 'Content-Type': 'application/vnd.api+json' } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }, auth)
    if (response.status == 204) {
      return null
    } else {
      return  await response.json() as SuccessfulResponse<T, ResourceObject>
    }
  } catch (error) {
    throw KError.getKError(error);
  }
}

const useAuthService = (): AuthService => {
  const store = useStore()
  return {
    accessToken: () => store.getters.accessToken,
    refresh: () => store.dispatch("authorize", { force: true })
  }
}

/** Make authenticated requests with raw bodies and unconsumed responses, including SSE. */
export const useRawApiFetch = () => {
  const auth = useAuthService()
  return (url: string, options: RequestInit = {}) => requestRaw(url, options, auth)
}

/**
 * Composable for making authenticated API calls. Use it only if
 * your request is not covered by store actions.
 * 
 * This is a compromise solution while we dont properly create a
 * "services" layer for API calls.
 */
export const useApiFetch = <T extends ResourceObject>() => { 
  const authService = useAuthService()
  return (url: string, options: FetchOptions = {}) => request<T>(url, options, authService)
}
