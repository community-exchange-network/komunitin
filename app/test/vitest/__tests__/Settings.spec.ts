import type { VueWrapper } from "@vue/test-utils"
import { QSelect } from "quasar"
import App from "src/App.vue"
import ToggleItem from "src/components/ToggleItem.vue"
import { i18n } from "src/boot/i18n"
import EditSettings from "src/pages/settings/EditSettings.vue"
import AccountSettingsFields from "src/pages/settings/AccountSettingsFields.vue"
import server, { seeds } from "src/server"
import {
  getMockPreferencePatchRequests,
  resetMockPreferencePatchRequests,
} from "src/server/SocialServer"
import { mountComponent, waitFor } from "../utils"

describe("Member-user settings", () => {
  let wrapper: VueWrapper

  const settingsPage = () => wrapper.findComponent(EditSettings)
  const notificationToggle = () => settingsPage().findAllComponents(ToggleItem).find(
    item => item.props("label") === i18n.global.t("myAccountNotifications"),
  )

  beforeAll(async () => {
    seeds()
    server.schema.users.first().update({ language: "ca" })
    wrapper = await mountComponent(App, { login: true })
    await wrapper.vm.$router.push("/home")
    await waitFor(() => wrapper.vm.$store.getters.myMemberUser !== undefined)
    await wrapper.vm.$router.push("/settings")
  })

  afterAll(() => wrapper.unmount())

  beforeEach(() => {
    resetMockPreferencePatchRequests()
  })

  it("initializes account settings from the revalidated resource", async () => {
    await wrapper.vm.$router.push("/home")
    const account = wrapper.vm.$store.getters.myAccount
    await wrapper.vm.$store.dispatch("accounts/load", {
      id: account.id,
      group: wrapper.vm.$store.getters.myMember.group.attributes.code,
      include: "settings,currency,currency.settings",
    })
    expect(wrapper.vm.$store.getters["accounts/current"].settings.attributes.acceptPaymentsAutomatically)
      .toBe(true)
    // Keep the cached value stale so the settings page must wait for server revalidation.
    // Mirage's schema types do not expose registered models.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(server.schema as any).accountSettings.findBy({ accountId: account.id }).update({
      acceptPaymentsAutomatically: false,
    })
    await wrapper.vm.$router.push("/settings")
    await waitFor(
      () => settingsPage().findComponent(AccountSettingsFields).exists(),
      true,
      "Revalidated account settings should render",
    )
    const fields = settingsPage().getComponent(AccountSettingsFields)
    const automaticPayments = fields.findAllComponents(ToggleItem).find(
      item => item.props("label") === i18n.global.t("acceptPaymentsAutomatically"),
    )
    expect(automaticPayments?.props("modelValue")).toBe(false)
  })

  it("loads identity language and patches self preferences through their owners", async () => {
    await waitFor(() => i18n.global.locale.value, "ca", "Login should apply the user language")
    expect(settingsPage().find(".inline-banner").exists()).toBe(true)

    const relationId = wrapper.vm.$store.getters.myMemberUser.id
    const userId = wrapper.vm.$store.getters.myUser.id
    notificationToggle().vm.$emit("update:modelValue", false)

    await waitFor(
      () => server.schema.memberUsers.find(relationId).notifications.myAccount,
      false,
      "Notification settings should patch the current member-user",
      3000,
    )

    const language = settingsPage().findAllComponents(QSelect).find(
      select => select.props("label") === i18n.global.t("language"),
    )
    await language.setValue({ label: "Español", value: "es" })

    await waitFor(
      () => server.schema.users.find(userId).language,
      "es",
      "Language should patch the current user",
      3000,
    )
    expect(getMockPreferencePatchRequests()).toEqual([
      `/social/GRP0/member-users/${relationId}`,
      `/social/users/${userId}`,
    ])
  })

  it("uses the first relation for admin editing and hides identity-only controls", async () => {
    expect(wrapper.vm.$store.getters.isAdmin).toBe(true)
    const currentMemberId = wrapper.vm.$store.getters.myMember.id
    const targetMember = server.schema.members.all().models.find(
      member => member.id !== currentMemberId && member.group.code === "GRP0",
    )
    const firstRelation = server.schema.memberUsers.where({ memberId: targetMember.id }).models
      .sort((left, right) => left.id.localeCompare(right.id))[0]
    firstRelation.update({
      notifications: { ...firstRelation.notifications, myAccount: true },
    })
    const secondUser = server.create("user", { language: "it" })
    const secondRelation = server.create("memberUser", {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      user: secondUser,
      member: targetMember,
      notifications: { myAccount: true, group: true },
    })

    await wrapper.vm.$router.push(
      `/groups/GRP0/admin/members/${targetMember.code}/settings`,
    )
    await waitFor(() => wrapper.vm.$route.name, "AdminEditSettings")
    await waitFor(
      () => wrapper.vm.$store.getters["member-users/currentList"]?.[0]?.relationships.member.data.id,
      targetMember.id,
      "Target member-user should load",
    )
    await waitFor(() => settingsPage().find(".inline-banner").exists(), false)

    expect(settingsPage().findAllComponents(QSelect).some(
      select => select.props("label") === i18n.global.t("language"),
    )).toBe(false)
    expect(settingsPage().find(".inline-banner").exists()).toBe(false)

    notificationToggle().vm.$emit("update:modelValue", false)
    await waitFor(
      () => server.schema.memberUsers.find(firstRelation.id).notifications.myAccount,
      false,
      "Admin settings should patch the first UUID-sorted relation",
      3000,
    )

    expect(server.schema.memberUsers.find(secondRelation.id).notifications.myAccount).toBe(true)
    expect(getMockPreferencePatchRequests()).toEqual([
      `/social/GRP0/member-users/${firstRelation.id}`,
    ])
  })
})
