import type { VueWrapper } from "@vue/test-utils"
import { QInput, QTable } from "quasar"
import App from "@/App.vue"
import ManageAccounts from "@/pages/admin/ManageAccounts.vue"
import DeleteMemberBtn from "@/pages/settings/DeleteMemberBtn.vue"
import server, { seeds } from "@/server"
import { mountComponent, waitFor } from "../utils"

describe("Manage accounts", () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.members.findBy({ status: "pending" }).update({ account: null })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it("loads pending requests without an account and searches account members", async () => {
    await wrapper.vm.$router.push("/groups/GRP0/admin/accounts")
    await waitFor(() => wrapper.vm.$route.path, "/groups/GRP0/admin/accounts")

    const page = wrapper.getComponent(ManageAccounts)
    const table = page.getComponent(QTable)
    await waitFor(
      () => table.findAll("tbody tr").length,
      25,
      "The initial account page should load"
    )

    const pending = page.findAllComponents(DeleteMemberBtn)
      .find(button => button.props('member').attributes.status === 'pending')
    expect(pending.get('button').attributes('disabled')).toBeUndefined()

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
