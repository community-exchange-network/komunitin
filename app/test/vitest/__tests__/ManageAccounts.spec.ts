import type { VueWrapper } from "@vue/test-utils"
import { QInput, QTable } from "quasar"
import App from "src/App.vue"
import ManageAccounts from "src/pages/admin/ManageAccounts.vue"
import { seeds } from "src/server"
import { mountComponent, waitFor } from "../utils"

describe("Manage accounts", () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it("loads and searches account members", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/admin/accounts")
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/admin/accounts")

    const page = wrapper.getComponent(ManageAccounts)
    const table = page.getComponent(QTable)
    await waitFor(
      () => table.findAll("tbody tr").length,
      25,
      "The initial account page should load"
    )

    const search = table.get("tbody tr:first-child td:nth-child(3)").text()
    await page.getComponent(QInput).get("input").setValue(search)

    await waitFor(
      () => table.findAll("tbody tr").length,
      1,
      "The matching account should remain visible"
    )

    expect(table.get("tbody tr").text()).toContain(search)
  })
})
