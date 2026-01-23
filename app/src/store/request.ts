import { type ActionContext } from "vuex";
import { type AuthService, request } from "src/composables/useApiFetch"
import { type ResourceObject } from "./model";

/**
 * Use this function if you need to call a JSON:API endpoint from within
 * a Vuex store action.
 */
export const apiRequest = async <T extends ResourceObject>(context: ActionContext<unknown, unknown>, url: string, method?: "get" | "post" | "patch" | "delete", data?: Record<string, unknown> | unknown[]) => {
  const auth: AuthService = {
    accessToken: () => context.rootGetters['accessToken'],
    refresh: () => context.dispatch("authorize", { force: true }, { root: true })
  }

  const options = {
    method: method?.toUpperCase() ?? "GET",
    body: data ?? undefined,
  }

  return request<T>(url, options, auth)

}