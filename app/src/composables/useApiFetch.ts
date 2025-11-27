import { useStore } from "vuex"
import {type ResourceObject, type SuccessfulResponse } from "../store/model"
import KError, { checkFetchResponse } from "../KError"

type FetchOptions = Omit<RequestInit, "body"> & {
  body?: Record<string, unknown> | unknown[]
}

export interface AuthService {
  accessToken: () => string | null
  refresh: () => Promise<void>
}

/**
 * Use useApiFetch instead of this function if outside of the store.
 */
export const request = async <T extends ResourceObject> (url: string, options: FetchOptions = {}, auth: AuthService) => {
  const doRequest = () => fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${auth.accessToken()}`,
      'Accept': 'application/vnd.api+json',
      ...(options.body ? { 'Content-Type': 'application/vnd.api+json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  try {
    let response = await doRequest()
    if (!response.ok && response.status == 401) {
      await auth.refresh()
      response = await doRequest()
    }
    // Throw error if response not ok
    await checkFetchResponse(response)
    if (response.status == 204) {
      return null
    } else {
      return  await response.json() as SuccessfulResponse<T, ResourceObject>
    }
  } catch (error) {
    throw KError.getKError(error);
  }
}

/**
 * Composable for making authenticated API calls. Use it only if
 * your request is not covered by store actions.
 * 
 * This is a compromise solution while we dont properly create a
 * "services" layer for API calls, to be used also by the store and
 * therefore it duplicates similar code within the store.
 */
export const useApiFetch = <T extends ResourceObject>() => { 
  const store = useStore()
  const authService: AuthService = {
    accessToken: () => store.getters.accessToken,
    refresh: () => store.dispatch("authorize", { force: true })
  }
  return (url: string, options: FetchOptions = {}) => request<T>(url, options, authService)
}
