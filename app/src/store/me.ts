import KError, { KErrorCode } from "src/KError";
import locate from "src/plugins/Location";
import type { ActionContext, Module } from "vuex";
import { setAccountingApiUrl } from ".";
import type { AuthData } from "../plugins/Auth";
import { Auth } from "../plugins/Auth";
import { getNotificationPermission, subscribe, unsubscribe } from "../plugins/Notifications";
import type { Member, NotificationsSubscription, } from "./model";

import { config } from "src/utils/config";
import { apiRequest } from "./request";

// Exported just for testing purposes.
export const auth = new Auth()

export interface LoginPayload {
  email: string
  password: string
  superadmin?: boolean
}

export type AuthorizePayload = {
  force: boolean
} | undefined | null

export interface UserState {
  tokens?: AuthData;
  myUserId?: string;
  /**
   * Current location, provided by device.
   */
  location?: [number, number];
  /**
   * Subscription to push notifications.
   */
  subscription?: NotificationsSubscription;
}

/**
 * Helper function that loads the user data after being logged in and having
 * the credentials.
 *
 * @param accessToken The access token
 * @param commit The local commit function.
 * @param dispatch The vuex Dispatch object.
 */
async function loadUser(
  { commit, dispatch, getters, rootGetters }: ActionContext<UserState, never>
) {
  // Resource actions allow including external relationships such as members.account,
  // but we can't use it right here because we still don't know the group code (nor 
  // the accounting api url), which is necessary for this process to work. So we 
  // manually do the two calls.
  await dispatch("users/load", {
    include: "members,members.group,settings"
  });
  const user = rootGetters["users/current"];

  // If the user is a member of a group, we get the currency and account data. 
  // This is not the case only when registering a new Group.
  if (user.members && user.members.length > 0) {
    // This is the currency URL from the Accounting API.
    const currencyUrl = user.members[0].group.relationships.currency.links.related;
    // https://.../accounting/<GROUP>/currency
    
    // Get the accounting API URL from the currency URL and update it in the store. This is
    // a way we have to be able to have multiple different accounting APIs for different
    // currencies. That may not be necessary in the future when we finish the migration to
    // the new API.
    const accountingApiUrl = currencyUrl.split('/').slice(0, -2).join('/');
    // https://.../accounting
    setAccountingApiUrl(accountingApiUrl)
    
    // We here compute the currency code and account code from their URLS so we can fetch 
    // them using the store methods. This is kind of a perversion of HATEOAS since we could 
    // more coherently fetch them directly from the provided link. But we have all the store 
    // infrastructure like this, so this is a little hack that I hope won't make problems.
    const currencyCode = currencyUrl.split('/').slice(-2)[0];

    // pending or deleted members don't have related account. Superadmins neither do.
    if (["active", "disabled", "suspended"].includes(user.members[0].attributes.state) && !getters.isSuperadmin) {
      const accountId = user.members[0].relationships.account.data.id
      await dispatch("accounts/load", {
        id: accountId, 
        group: currencyCode, 
        include: "settings,currency,currency.settings"
      });
    } else {
    // otherwise get currency at least.
      await dispatch("currencies/load", {
        group: currencyCode,
        include: "settings"
      });
    }
  }

  commit("myUserId", user.id);
  
  // Initialize the location to the member configured location.
  if (getters.myMember) {
    const member = getters.myMember as Member
    commit("location", member.attributes.location?.coordinates)
  }

  // Fetch initial unread notifications count.
  dispatch("notifications/updateUnreadCount", null, { root: true })
    .catch(e => console.warn("Failed to fetch unread count", e));

  // Renew push notification subscription if permission is already granted
  if (getNotificationPermission() === 'granted') {
    dispatch("subscribe").catch(e => console.warn("Failed to restore subscription", e));
  }
}

export default {
  state: () => ({
    tokens: undefined,
    // It is important to define the properties even if undefined in order to add the reactivity.
    myUserId: undefined,
    accountId: undefined,
    location: undefined,
    subscription: undefined,
  } as UserState),
  getters: {
    isLoggedIn: state =>
      state.myUserId !== undefined &&
      auth.isAuthorized(state.tokens),
    isComplete: (state, getters) =>
      ["active", "disabled", "suspended"].includes(getters.myMember?.attributes.state),
    isSubscribed: state =>
      state.subscription !== undefined,
    myUser: (state, getters, rootState, rootGetters) => {
      if (state.myUserId !== undefined) {
        return rootGetters["users/one"](state.myUserId);
      }
      return undefined;
    },
    myMember: (state, getters) => {
      const user = getters.myUser;
      if (user?.members?.length > 0) {
        return user.members[0];
      }
      return undefined;
    },
    myAccount: (state, getters) => {
      return getters.isComplete 
        ? getters.myMember?.account 
        : false
    },
    myCurrency: (state, getters) => {
      return getters.myAccount?.currency ??
        getters.myMember?.group?.currency
    },
    accessToken: (state) => 
      state.tokens?.accessToken
    ,
    /*
    * Returns true if the group is using the legacy (IntegralCES) accounting API.
    */
    isLegacyAccounting: (state, getters) => {
      // This next check implies that the group is using the legacy accounting API, 
      // since the old api don't have the admins relationship. Otherwise the admin
      // interface is disabled.
      return (getters.myCurrency !== undefined) 
        ? !getters.myCurrency.relationships.admins
        : undefined
    },
    isAdmin: (state, getters) => {
      return state.myUserId !== undefined 
        && !getters.isLegacyAccounting
        && getters.myCurrency?.relationships.admins.data.some((r: { id: string }) => r.id === state.myUserId)
    },
    isSuperadmin: (state) => {
      return state.tokens?.scopes?.includes(Auth.SUPERADMIN_SCOPE)
    }
    
  },
  mutations: {
    tokens: (state, tokens) => (state.tokens = tokens),
    myUserId: (state, myUserId) => (state.myUserId = myUserId),
    location: (state, location) => (state.location = location),
    subscription: (state, subscription) => (state.subscription = subscription),
  },

  actions: {
    /**
     * Authorize user using email and password.
     */
    login: async (
      context: ActionContext<UserState, never>,
      payload: LoginPayload
    ) => {
      const tokens = await auth.login(payload);
      context.commit("tokens", tokens);
      await loadUser(context);
    },
    /**
     * Silently authorize user using stored credentials. Throws exception (rejects)
     * on failed authorization.
     */
    authorize: async (
      context: ActionContext<UserState, never>,
      payload: AuthorizePayload
    ) => {
      if (!context.getters.isLoggedIn || payload?.force) {
        try {
          const storedTokens = await auth.getStoredTokens();
          const tokens = await auth.authorize(storedTokens, payload?.force);
          context.commit("tokens", tokens);
          await loadUser(context);
        } catch (error) {
          // Couldn't authorize. Delete credentials so we don't attempt another
          // call next time.
          if (context.state.tokens) {
            context.dispatch("logout", { authorizationError: true });
          }
          throw error;
        }
      }
    },
    /**
     * 
     * @param context 
     */
    authorizeWithCode: async (context: ActionContext<UserState, never>, payload: {code: string}) => {
      const tokens = await auth.authorizeWithCode(payload.code);
      context.commit("tokens", tokens);
      await loadUser(context);
    },
    /**
     * Logout current user.
     */
    logout: async (context: ActionContext<UserState, never>, payload: { authorizationError?: boolean }) => {
      // Give max 2 seconds for the unsubscription to complete, but don't block logout.
      const unsubscribePromise = context.dispatch("unsubscribe", {
        unsubscribeFromServer: !(payload?.authorizationError)
      }).catch(e => console.error(e));
      const maxWait = new Promise(resolve => setTimeout(resolve, 2000));
      await Promise.race([unsubscribePromise, maxWait]);

      await auth.logout();
      context.commit("tokens", undefined);
      context.commit("myUserId", undefined);
    },
    /**
     * Get the current location from the device.
     */
    locate: async ({ commit }: ActionContext<UserState, never>) => {
      try {
        const location = await locate()
        commit("location", location);
      } catch (error) {
        if (error instanceof GeolocationPositionError) {
          const codes = [] as KErrorCode[]
          codes[error.TIMEOUT] = KErrorCode.PositionTimeout
          codes[error.POSITION_UNAVAILABLE] = KErrorCode.PositionUnavailable
          codes[error.PERMISSION_DENIED] = KErrorCode.PositionPermisionDenied
          const kerror = new KError(codes[error.code], error.message, undefined, error)
          throw kerror
        }
      }
    },
    /**
     * Subscribe to push notifications
    */
    subscribe: async (context: ActionContext<UserState, never>) => {
      const { state, commit, getters } = context
      // renew subscription if not there, incorrect user and every 24h
      const shouldRenewSubscription = getters.isLoggedIn && (!state.subscription 
        || state.subscription.relationships?.user?.data.id !== getters.myUser.id
        || new Date(state.subscription.attributes.updated) < new Date(Date.now() - 24 * 60 * 60 * 1000)
      )

      if (shouldRenewSubscription) {
        // 1. Subscribe in the Browser
        const attributes = await subscribe()

        // 2. Register subscription in the Backend
        const userId = getters.myUser.id
        const groupCode = getters.myMember.group.attributes.code
        if (!userId || !groupCode) {
          throw new KError(KErrorCode.ScriptError, "Missing user id or group code when subscribing to push notifications");
        }
        
        const body = {
          data: {
            type: "subscriptions",
            attributes,
            relationships: {
              user: {
                data: { id: userId, type: "users" }
              }
            }
          }
        }
        const url = `${config.NOTIFICATIONS_URL}/${groupCode}/subscriptions`

        const response = await apiRequest<NotificationsSubscription>(context, url, 'post', body);

        // 3. Store subscription in the Vuex store
        if (response) {
          commit("subscription", response.data);
        }

        return response
      }
    },
    /**
     * Unsubscribe from push notifications.
     * This function does not throw if the unsubscription fails, but only logs the error in the console.
     */
    unsubscribe: async (context: ActionContext<UserState, never>, payload: { unsubscribeFromServer?: boolean }) => {
      const { state, commit, getters } = context;
      
      // Get data before clearing local state.
      const subscription = state.subscription;
      const groupCode = getters.myMember?.group?.attributes.code;

      // Remove subscription from local state.
      commit("subscription", undefined);

      const promises = [];

      // Unsubscribe from browser.
      promises.push(unsubscribe().catch(e => console.error("Failed to unsubscribe from browser notifications", e)));
      
      // Delete from Backend
      const deleteFromServer = (payload?.unsubscribeFromServer ?? true) && subscription && groupCode !== undefined;
      
      if (deleteFromServer) {
        const url = `${config.NOTIFICATIONS_URL}/${groupCode}/subscriptions/${subscription.id}`;
        const serverPromise = async () => {
          try {
            await apiRequest(context, url, 'delete');
          } catch (error) {
            // Swallow not found errors.
            if (!(error instanceof KError && error.code === KErrorCode.NotFound)) {
              throw error;
            }
          }
        }
        promises.push(serverPromise().catch(e => console.error("Failed to unsubscribe from server notifications", e)));
      }
      await Promise.allSettled(promises);
    }
  }
} as Module<UserState, never>;
