import { Module, ActionContext } from "vuex";
export interface UIState {
  drawerPersistent: boolean;
  drawerState: boolean;
  notificationsBannerDismissed: boolean;
  locationBannerDismissed: boolean;
  inactiveBannerDismissed: boolean;
  previousRoute: string | undefined;
}

export default {
  state: () => ({
    drawerPersistent: true,
    drawerState: false,
    notificationsBannerDismissed: false,
    locationBannerDismissed: false,
    inactiveBannerDismissed: false,
    previousRoute: undefined,
    loggingOut: false
  }),
  getters: {
    drawerExists: (state, getters, rootState, rootGetters) =>
      // Don't show the drawer for draft/pending users.
      rootGetters.isComplete
  },
  mutations: {
    drawerPersistent: (state, value: boolean) =>
      (state.drawerPersistent = value),
    drawerState: (state, value: boolean) => (state.drawerState = value),
    notificationsBannerDismissed: (state, value: boolean) => (state.notificationsBannerDismissed = value),
    locationBannerDismissed: (state, value: boolean) => (state.locationBannerDismissed = value),
    inactiveBannerDismissed: (state, value: boolean) => (state.inactiveBannerDismissed = value),
    previousRoute: (state, previousRoute: string) => (state.previousRoute = previousRoute),
  },
  actions: {
    toogleDrawer: ({ state, commit }: ActionContext<UIState, never>) =>
      commit("drawerState", !state.drawerState)
  }
} as Module<UIState, never>;

