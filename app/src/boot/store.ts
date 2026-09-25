import { defineBoot } from "#q-app"
import store from "@/store";

/**
 * Install Vuex explicitly; Quasar's built-in store integration targets Pinia.
 */
export default defineBoot(({ app }) => {
  app.use(store)
})
