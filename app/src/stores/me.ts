import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { usePersistStore } from "./persist";
import type { User, Member, Group, GroupSettings, UserSettings } from "../store/model";
import { useResource, UseResourceOptions } from "../composables/useResource";
import { getAuthService, services } from "../services/services";
import KError, { KErrorCode } from "../KError";
import { notifications } from "../utils/notifications";
import { handleError } from "../boot/errors";

type EnhancedUser = User & {
  members: (Member & {group: Group & {settings: GroupSettings}})[]
  settings: UserSettings
}

const ME_STORE_KEY = "me"

export const useMeStore = defineStore(ME_STORE_KEY, () => {
  /**
   * Current logged-in user id.
   */
  const userId = ref<string|null>(null)
  /**
   * Current location, provided by device.
   */
  const location = ref<[number, number] | null>(null)
  /**
   * Subscription object to push notifications. Used to unsubscribe if needed.
   */
  const subscriptionId = ref<string|null>(null)
  /**
   * Last time the subscription was updated or created.
   */
  const subscriptionDate = ref<Date|null>(null)

  const snapshot = () => ({
    userId: userId.value,
    location: location.value,
    subscription: subscriptionId.value,
    subscriptionDate: subscriptionDate.value
  })

  const restore = (state: ReturnType<typeof snapshot>) => {
    userId.value = state.userId
    location.value = state.location
    subscriptionId.value = state.subscription
    subscriptionDate.value = state.subscriptionDate
  }

  usePersistStore({
    id: ME_STORE_KEY,
    snapshot,
    restore,
  })

  // Here some computed properties to get user, member, group, account and currency
  // and actions to load them on startup or after login.

  const {resource: user, load: loadUser} = useResource<EnhancedUser>("users", () => ({
    id: userId.value,
    include: ["members", "members.group", "settings", "members.group.settings"],
    immediate: false
  } as UseResourceOptions))

  const member = computed(() => user.value?.members?.[0] ?? null)
  const group = computed(() => member.value?.group ?? null)

  // https://.../accounting/<GROUP>/currency
  const currencyUrl = () => group.value?.relationships.currency.data.meta?.href as string | undefined
  // https://.../accounting/<GROUP>/accounts/<ACCOUNT>
  const accountUrl = () => member.value?.relationships.account?.data?.meta?.href as string | undefined
  // https://.../accounting
  const accountingApiUrl = () => {
    const currencyUrlValue = currencyUrl()
    
    if (currencyUrlValue) {
      const parts = currencyUrlValue.split('/')
      return parts.slice(0, parts.length - 2).join('/')
    }
    return null
  }

  // Load account and currency if member and group are defined.
  const {resource: account, load: loadAccount} = useResource("accounts", () => ({
    url: accountUrl(),
    include: ["settings", "currency", "currency.settings"],
    immediate: false
  } as UseResourceOptions))

  const {resource: currency, load: loadCurrency} = useResource("currencies", () => ({
    url: currencyUrl(),
    include: ["settings"],
    immediate: false
  } as UseResourceOptions))

  // Load all user-related data.  
  const auth = getAuthService()
  
  const load = async () => {
    const isLoggedIn = await auth.isAuthorized()
    if (!isLoggedIn) {
      throw new KError(KErrorCode.Unauthorized, "Not logged in")
    }
    await loadUser()
    userId.value = user.value!.id    

    // This is a way we have to be able to have multiple different accounting APIs for different
    // currencies. That may not be necessary in the future when we finish the migration to
    // the new API.
    const accountingUrl = accountingApiUrl()
    if (accountingUrl) {
      services.setBaseUrl("accounting", accountingUrl)
    }
    // Load account if possible, otherwise fallback to loading currency only.
    if (accountUrl()) {
      try {
        await loadAccount()
      } catch (error) {
        // Note that (unfortunately) the service sometimes returns an account link for members that
        // don't have an account, so we need to handle the NotFound error.
        if (error instanceof KError && error.code === KErrorCode.NotFound) {
          await loadCurrency()
        } else {
          throw error
        }
      }
    } else if (currencyUrl()) {
      await loadCurrency()
    }

    // Trigger a refresh of the notifications subscription, without waiting.
    refreshSubscription().catch(error => {
      handleError(KError.getKError(error))
    })
  }

  const login = async (params: {
    email: string, password: string, superadmin?: boolean
  }) => {
    await auth.login(params) // throws on invalid credentials
    await load()
  }

  const isLoggedIn = computed(() => userId.value !== null && auth.isAuthorized())

  const logout = async () => {
    await unsubscribe()
    location.value = null
    await auth.logout()
  }

  const authorize = async (params?: {force?: boolean}) => {
    if (isLoggedIn.value && !params?.force) {
      return
    }
    try {
      await auth.authorize(params) // throws if not authorized
      await load()
    } catch (error) {
      await auth.logout()
      throw error
    }
  }

  const authorizeWithCode = async (params: {
    code: string
  }) => {
    await auth.loginWithCode(params) // throws on invalid code
    await load()
  }

  const isComplete = computed(() => {
    const state = member.value?.attributes.state
    return state && ["active", "disabled", "suspended"].includes(state)
  })

  const isLegacyAccounting = computed(() => {
    // This next check implies that the group is using the legacy accounting API, 
    // since the old api don't have the admins relationship. Otherwise the admin
    // interface is disabled.
    return (currency.value) 
      ? !(currency.value.relationships?.admins)
      : undefined
  })

  const isAdmin = computed(() => {
    const admins = currency.value?.relationships?.admins?.data
    return Array.isArray(admins) && admins.some((r: { id: string }) => r.id === userId.value)
  })
  
  // Manage push notifications subscription.
  const unsubscribe = async () => {
    if (subscriptionId.value) {
      notifications.unsubscribe(subscriptionId.value)
    }
    subscriptionId.value = null
    subscriptionDate.value = null
  }

  const isSubscribed = computed(() => subscriptionId.value !== null)

  const notificationsSettings = () => {
    const userSettings = user.value?.settings
    if (!userSettings) {
      throw new KError(KErrorCode.ScriptError, "User settings not loaded")
    }
    const settings = {
      ...userSettings.attributes.notifications,
      locale: userSettings.attributes.language,
    }
    return settings
  }

  const subscribe = async () => {
    const settings = notificationsSettings()
    const id = await notifications.subscribe(user.value!, member.value!, settings)
    subscriptionId.value = id
    subscriptionDate.value = new Date()
  }

  const refreshSubscription = async () => {
    if (notifications.hasPermission()) {
      await subscribe()
    } else if (subscriptionId.value) {
      await unsubscribe()
    }
  }


  return {
    // state
    userId,
    location,
    subscriptionId,
    subscriptionDate,

    // resources
    user,
    member,
    group,
    account,
    currency,
    
    // computed
    isSubscribed,
    isLoggedIn,
    isComplete,
    isAdmin,
    isLegacyAccounting,

    // actions
    authorize,
    authorizeWithCode,
    login,
    logout,
    subscribe,
    unsubscribe,

  }
})