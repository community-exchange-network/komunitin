import { KOptions } from "../boot/koptions";
import KError, { KErrorCode } from "../KError";
import { AuthServiceImpl } from "./auth"
import { services } from "./services";


export const setupResourceServices = () => {
  // Setup auth service
  const tokenEndpoint = KOptions.url.auth + "/token";
  const clientId = KOptions.oauth.clientid
  
  const authService = new AuthServiceImpl(
    tokenEndpoint,
    clientId
  )
  services.setAuthService(authService)
  
  // Social API
  services.setBaseUrl("social", KOptions.url.social)

  services.register("groups", "social", {
    endpoints: {
      collection: () => "/groups",
      resource: (code: string) => `/${code}`
    }
  })
  services.register("group-settings", "social", {
    endpoints: {
      collection: () => {throw new KError(KErrorCode.ScriptError, "Group settings cannot be listed");},
      resource: (code: string) => `/${code}/settings`
    }
  })
  services.register("contacts", "social")
  services.register("members", "social")
  services.register("offers", "social")
  services.register("needs", "social")
  services.register("categories", "social")
  services.register("users", "social", {
    endpoints: {
      collection: () => "/users",
      resource: (group: unknown, id?: string) => id ? `/users/${id}` : "/users/me"
    }
  })
  services.register("user-settings", "social", {
    endpoints: {
      collection: () => {throw new KError(KErrorCode.ScriptError, "User settings cannot be listed");},
      resource: (group: unknown, id: string) => `/users/${id}/settings`
    }
  })

  // Accounting API
  services.setBaseUrl("accounting", KOptions.url.accounting)
  services.register("currencies", "accounting", {
    endpoints: {
      collection: () => "/currencies",
      resource: (group: string) => `/${group}/currency`
    },
    inverseRelationships: {
      group: {
        type: "groups",
        relationship: "currency"
      }
    }
  })
  services.register("currency-settings", "accounting", {
    endpoints: {
      collection: () => { throw new KError(KErrorCode.ScriptError, "Currency settings cannot be listed") },
      resource: (group: string) => `/${group}/currency/settings`
    }
  })
  services.register("accounts", "accounting", {
    inverseRelationships: {
      member: {
        type: "members",
        relationship: "account"
      }
    }
  })
  services.register("account-settings", "accounting", {
    endpoints: {
      collection: () => { throw new KError(KErrorCode.ScriptError, "Account settings cannot be listed") },
      resource: (group: string, id: string) => `/${group}/accounts/${id}/settings`
    }
  })
  services.register("transfers", "accounting")
  services.register("trustlines", "accounting")
  
  // Notifications API
  services.setBaseUrl("notifications", KOptions.url.notifications)
  services.register("subscriptions", "notifications", {
    endpoints: {
      collection: () => "/subscriptions",
      resource: (group: unknown, id: string) => `/${id}`
    }
  })

}