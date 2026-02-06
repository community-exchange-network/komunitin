import type { Store } from "vuex";
import { createStore } from "vuex";
import type { ResourcesState } from "./resources";
import { Resources } from "./resources";
import { NotificationResources } from "./notifications";
import { config } from "src/utils/config";
import type {
  User,
  UserSettings,
  Group,
  Contact,
  Offer,
  Need,
  Category,
  Currency,
  Account,
  AccountSettings,
  Member,
  Transfer,
  GroupSettings,
  CurrencySettings,
  Trustline,
  Notification
} from "src/store/model";
// Import logged-in user module
import type { UserState } from "./me";
import me from "./me";
import type { UIState } from "./ui";
import ui from "./ui";
import createPersistPlugin from "./persist";
import KError, { KErrorCode } from "src/KError";
import type { Topup, AccountTopupSettings, TopupSettings } from "../features/topup/model";

// Build modules for Social API:
const socialUrl = config.SOCIAL_URL;
// `groups` resource does not follow the general pattern for endpoints.
const groups = new (class extends Resources<Group, unknown> {
  collectionEndpoint = () => "/groups";
  resourceEndpoint = (groupCode: string) => `/${groupCode}`;
})("groups", socialUrl);

const groupSettings = new (class extends Resources<GroupSettings, unknown> {
  collectionEndpoint = () => {throw new KError(KErrorCode.ScriptError, "Group settings cannot be listed");};
  resourceEndpoint = (groupCode: string) => `/${groupCode}/settings`;
})("group-settings", socialUrl)

const contacts = new Resources<Contact, unknown>("contacts", socialUrl);
const members = new Resources<Member, unknown>("members", socialUrl);

const offers = new Resources<Offer, unknown>("offers", socialUrl);
const needs = new Resources<Need, unknown>("needs", socialUrl);
const categories = new Resources<Category, unknown>("categories", socialUrl);
const users = new (class extends Resources<User, unknown> {
  collectionEndpoint = () => "/users";
  resourceEndpoint = (groupCode: string, id?: string) => id ? `/users/${id}` : "/users/me";
})("users", socialUrl);

const userSettings = new (class extends Resources<UserSettings, unknown> {
  collectionEndpoint = () => {throw new KError(KErrorCode.ScriptError, "User settings cannot be listed");};
  resourceEndpoint = (groupCode: string, id: string) => `/users/${id}/settings`;
})("user-settings", socialUrl);

// Build modules for Accounting API:
const accountingUrl = config.ACCOUNTING_URL;
// Build modules for Accounting API:
// `currencies` resource does not follow the general pattern for endpoints.
const currencies = new (class extends Resources<Currency, unknown> {
  collectionEndpoint = () => "/currencies";
  resourceEndpoint = (groupCode: string) => `/${groupCode}/currency`;
  /**
   * Defines the inverse of the external relation group -> currency, so 
   * actions to currencies module can be called with include=group.
   */
  inverseRelationships = () => ({
    group: {
      module: "groups",
      field: "currency"
    }
  })
})("currencies", accountingUrl);

const currencySettings = new (class extends Resources<CurrencySettings, unknown> {
  collectionEndpoint = () => {throw new KError(KErrorCode.ScriptError, "Currency settings cannot be listed");};
  resourceEndpoint = (groupCode: string) => `/${groupCode}/currency/settings`;
})("currency-settings", accountingUrl)

const accounts = new (class extends Resources<Account, unknown> {
  /**
   * Defines the inverse of the external relation member -> account, so 
   * actions to accounts module can be called with include=member.
   */
  inverseRelationships = () => ({
    member: {
      module: "members",
      field: "account"
    }
  })
})("accounts", accountingUrl);

const accountSettings = new (class extends Resources<AccountSettings, unknown> {
  collectionEndpoint = () => {throw new KError(KErrorCode.ScriptError, "Account settings cannot be listed");};
  resourceEndpoint = (groupCode: string, id: string) => `/${groupCode}/accounts/${id}/settings`;
})("account-settings", accountingUrl)

const transfers = new Resources<Transfer, unknown>("transfers", accountingUrl);

const trustlines = new Resources<Trustline, unknown>("trustlines", accountingUrl);


const notificationsUrl = config.NOTIFICATIONS_URL;
const notifications = new NotificationResources("notifications", notificationsUrl);

const modules = {
    // Logged-in user module
    me,
    // User interface module.
    ui,

    // Resource modules:

    // Remark: The names of the resource modules must
    // be equal to the type property of the resources they
    // represent.

    // Social API resource modules.
    users,
    "user-settings": userSettings,
    groups,
    contacts,
    members,
    offers,
    needs,
    categories,
    "group-settings": groupSettings,

    // Accounting API resource modules.
    currencies,
    "currency-settings": currencySettings,
    accounts,
    "account-settings": accountSettings,
    transfers,
    trustlines,

    // Notifications API resource module.
    notifications,
  }

if (process.env.FEAT_TOPUP === "true") {
  modules["topup-settings"] = new (class extends Resources<TopupSettings, unknown> {
    collectionEndpoint = () => {throw new KError(KErrorCode.ScriptError, "Topup settings cannot be listed");}
    resourceEndpoint = (groupCode: string) => `/${groupCode}/currency/topup-settings`;
  })("topup-settings", accountingUrl);
  
  modules["account-topup-settings"] = new (class extends Resources<AccountTopupSettings, unknown> {
    collectionEndpoint = () => {throw new KError(KErrorCode.ScriptError, "Account topup settings cannot be listed");}
    resourceEndpoint = (groupCode: string, id: string) => `/${groupCode}/accounts/${id}/topup-settings`;
  })("account-topup-settings", accountingUrl);

  modules["topups"] = new Resources<Topup, unknown>("topups", accountingUrl);
}

/*
 * If not building with SSR mode, you can
 * directly export the Store instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Store instance.
 */

export default createStore({
  modules,
  // enable strict mode (adds overhead!) for dev mode only
  strict: process.env.DEV === "true",
  plugins: [createPersistPlugin()]
});

export const setAccountingApiUrl = (url: string) => {
  // Update the global config object
  config.ACCOUNTING_URL = url;

  // Update the base urls of the resource modules
  currencies.setBaseUrl(url);
  currencySettings.setBaseUrl(url);
  accounts.setBaseUrl(url);
  accountSettings.setBaseUrl(url);
  transfers.setBaseUrl(url);
  trustlines.setBaseUrl(url);
}

declare module 'vue' {
  interface State {
    me: UserState
    ui: UIState
    users: ResourcesState<User>
    userSettings: ResourcesState<UserSettings>
    groups: ResourcesState<Group>
    groupSettings: ResourcesState<GroupSettings>
    contacts: ResourcesState<Contact>
    members: ResourcesState<Member>
    offers: ResourcesState<Offer>
    needs: ResourcesState<Need>
    categories: ResourcesState<Category>
    currencies: ResourcesState<Currency>
    currencySettings: ResourcesState<CurrencySettings>
    accounts: ResourcesState<Account>
    accountSettings: ResourcesState<AccountSettings>
    transfers: ResourcesState<Transfer>
    trustlines: ResourcesState<Trustline>
    notifications: ResourcesState<Notification>
  }
  interface ComponentCustomProperties {
    $store: Store<State>
  }
}
/*
export const parseResourceUrl = (url: string, type: string) : {baseUrl: string, group?: string, id?: string}|undefined => {
  if (["contacts", "members", "offers", "needs", "categories", "accounts", "transfers"].includes(type)) {
    const match = url.match(new RegExp(`^([.]*)/([a-zA-Z0-9]*)/(${type})/([^/]*)$`))
    if (match) {
      return {
        baseUrl: match[1],
        group: match[2],
        id: match[4]
      }
    }
  } else if (type === "currencies") {
    const match = url.match(new RegExp(`^([.]*)/([a-zA-Z0-9]*)/currency$`))
    if (match) {
      return {
        baseUrl: match[1],
        group: match[2],
      }
    }
  } else if (type === "users") {
    const match = url.match(new RegExp(`^([.]*)/users/([^/]*)$`))
    if (match) {
      return {
        baseUrl: match[1],
        id: match[2]
      }
    }
  } else if (type === "account-settings") {
    const match = url.match(new RegExp(`^([.]*)/([a-zA-Z0-9]*)/accounts/([^/]*)/settings$`))
    if (match) {
      return {
        baseUrl: match[1],
        group: match[2],
        id: match[3]
      }
    }
  } else if (type === "user-settings") {
    const match = url.match(new RegExp(`^([.]*)/users/([^/]*)/settings$`))
    if (match) {
      return {
        baseUrl: match[1],
        id: match[2]
      }
    }
  } else if (type === "group") {
    const match = url.match(new RegExp(`^([.]*)/([^/]*)$`))
    if (match) {
      return {
        baseUrl: match[1],
        id: match[2]
      }
    }
  }
  return undefined
}
*/