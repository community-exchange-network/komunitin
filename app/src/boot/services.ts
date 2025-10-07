import { boot } from "quasar/wrappers"
import { setupResourceServices } from "../services/setup"

boot(() => {
  setupResourceServices()
})