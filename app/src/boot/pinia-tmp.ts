import { boot } from 'quasar/wrappers'
import store from 'src/stores'

/*
 * This boot file is used to instantiate Pinia and make it available in the app.
 * It is a temporary solution until we migrate all stores from Vuex to Pinia.
 **/ 

export default boot(async ({ app }) => {
  
  const pinia = await store({})
  app.use(pinia);
})