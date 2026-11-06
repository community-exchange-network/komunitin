import type { VueWrapper } from "@vue/test-utils"
import App from "@/App.vue"
import { Auth } from "@/plugins/Auth"
import server, { seeds } from "@/server"
import { mockToken } from "@/server/AuthServer"
import store from "@/store"
import { auth } from "@/store/me"
import { mountComponent, waitFor } from "../utils"

describe("Superadmin", () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    await store.dispatch("logout")
    const user = server.create("user")
    await auth.processTokenResponse(mockToken(Auth.SCOPES, { superadmin: true, userId: user.id }))
    wrapper = await mountComponent(App, { login: "cached" })
  })

  afterAll(() => wrapper.unmount())

  it("uses the viewed community's currency for transfers", async () => {
    expect(store.getters.myCurrency).toBeUndefined()
    await wrapper.vm.$router.push("/groups/GRP0/admin/transactions")
    await waitFor(
      () => wrapper.findAll(".transaction-amount").some(item => item.text() === "$22.09"),
      true
    )
  })
})
