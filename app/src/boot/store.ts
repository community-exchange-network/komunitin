import { defineBoot } from "#q-app/wrappers"
import store from "src/store";

/**
 * Vuex is no longer supported in @quasar/app-vite v2, so we need to
 * manually install it in the app.
 */
export default defineBoot(({ app }) => {
  app.use(store)
})
