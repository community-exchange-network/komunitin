import type { Router } from 'vue-router';
import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from 'vue-router'
import { scroll } from 'quasar'
import routes from "./routes";
import store from '@/store';
/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default function( ): Router {
  const createHistory = import.meta.env.QUASAR_SERVER
    ? createMemoryHistory
    : import.meta.env.QUASAR_VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory

  const router = createRouter({
    scrollBehavior: () => {
      // Containerized QLayouts scroll independently of the window.
      const layout = document.querySelector('.q-layout')
      const target = layout ? scroll.getScrollTarget(layout) : window
      target.scrollTo({ left: 0, top: 0 })
      return false
    },
    routes,

    // Leave these as they are and change in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(import.meta.env.QUASAR_VUE_ROUTER_BASE)
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
