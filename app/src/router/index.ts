import type { Router } from 'vue-router';
import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from 'vue-router'
import routes from "./routes";
import store from 'src/store';
/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default function( ): Router {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory

  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave these as they are and change in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE)
  });



  store.commit("previousRoute", undefined)
  let first = true;
  
  router.afterEach((to, from, failure) => {
    if (!failure) {
      // there is a first call to this guard at the first page that we want to ignore.
      if(!first) {
        store.commit("previousRoute", from.meta.back === false ? undefined : from.fullPath)
      } else {
        first = false
      }
    }
  })

  return router;
}
