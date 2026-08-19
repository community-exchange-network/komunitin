import type { VueWrapper } from "@vue/test-utils"
import App from "src/App.vue"
import server, { seeds } from "src/server"
import { mountComponent, testLogin, waitFor } from "../utils"

describe("admin routes", () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.findBy("currency", { code: "GRP0" })?.update({ admins: [] })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it("logs out an ordinary member attempting group and superadmin routes", async () => {
    for (const path of ["/groups/GRP0/admin/accounts", "/superadmin/groups"]) {
      await testLogin()
      await wrapper.vm.$router.push(path)
      await waitFor(() => wrapper.vm.$store.getters.isLoggedIn, false)
      await waitFor(() => wrapper.vm.$route.path, "/login-mail")
      expect(wrapper.vm.$route.query.redirect).toBe(path)
    }
  })
})
