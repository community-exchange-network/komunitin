import { Module, ActionContext } from "vuex";
import { Auth, AuthData } from "../plugins/Auth";
import KError, { KErrorCode } from "src/KError";
import { notifications } from "src/plugins/Notifications";
import locate from "src/plugins/Location";
import {Member, NotificationsSubscription, UserSettings} from "./model"
import { setAccountingApiUrl } from ".";

// Exported just for testing purposes.
export const auth = new Auth()

export interface LoginPayload {
  email: string;
  password: string;
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
  { commit, dispatch, state, getters, rootGetters }: ActionContext<UserState, never>
) {
  // Resource actions allow including external relationships such as members.account,
  // but we can't use it right here because we still don't know the group code (nor 
  // the accounting api url), which is necessary for this process to work. So we 
  // manually do the two calls.
  await dispatch("users/load", {
    include: "members,members.group,settings"
  });
  const user = rootGetters["users/current"];

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

  // pending or deleted members don't have related account.
  if (["active", "suspended"].includes(user.members[0].attributes.state)) {
    const accountId = user.members[0].relationships.account.data.id
    await dispatch("accounts/load", {
      id: accountId, 
      group: currencyCode, 
      include: "currency,settings"
    });
  } else {
  // otherwise get currency at least.
    await dispatch("currencies/load", {
      id: currencyCode
    });
  }

  commit("myUserId", user.id);
  
  // If we don't have the user location yet, initialize to the member configured location.
  if (state.location == undefined) {
    const member = getters["myMember"] as Member
    commit("location", member.attributes.location?.coordinates)
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
    isActive: (state, getters) =>
      getters.myMember?.attributes.state === "active",
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
      if (user?.members.length > 0) {
        return user.members[0];
      }
      return undefined;
    },
    myAccount: (state, getters) => {
      return getters.isActive 
        ? getters.myMember?.account 
        : false
    },
    myCurrency: (state, getters) => {
      return getters.isActive
        ? getters.myAccount?.currency
        : getters.myMember?.group?.currency
    },
    accessToken: (state) => 
      state.tokens?.accessToken
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
      const tokens = await auth.login(payload.email, payload.password);
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
            context.dispatch("logout");
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
    logout: async (context: ActionContext<UserState, never>) => {
      await context.dispatch("unsubscribe");
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
          const kerror = new KError(codes[error.code], error.message, error)
          throw kerror
        }
      }
    },
    /**
     * Subscribe to push notifications
    */
    subscribe: async (context: ActionContext<UserState, never>) => {
      if (!context.getters.isSubscribed && context.getters.isLoggedIn) {
        const userSettings = context.getters.myUser?.settings as UserSettings
        if (userSettings) {
          const subscription = await notifications.subscribe(
            context.getters.myUser, 
            context.getters.myMember,
            {
              locale: userSettings.attributes.language,
              ...userSettings.attributes.notifications
            },
            context.getters.accessToken);
          context.commit("subscription", subscription);

        }
      }
    },
    /**
     * Unsubscribe from push notifications.
     */
    unsubscribe: async (context: ActionContext<UserState, never>) => {
      if (context.state.subscription) {
        await notifications.unsubscribe(context.state.subscription, context.getters.accessToken);
        context.commit("subscription", undefined);
      }
    }
  }
} as Module<UserState, never>;
