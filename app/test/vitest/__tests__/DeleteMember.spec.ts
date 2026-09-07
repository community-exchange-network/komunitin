import type { VueWrapper } from '@vue/test-utils'
import { QBtn, QDialog, QCard, Notify } from 'quasar'
import App from 'src/App.vue'
import PasswordField from 'src/components/PasswordField.vue'
import DeleteMemberBtn from 'src/pages/settings/DeleteMemberBtn.vue'
import { Auth } from 'src/plugins/Auth'
import { failNextMockIdentityDeletion } from 'src/server/SocialServer'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

// Mirage does not type registered model associations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema = server.schema as any

describe('Member deletion', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    for (const currency of schema.currencies.all().models) currency.update({ admins: [] })
    const user = schema.users.first()
    const otherMember = schema.groups.findBy({ code: 'GRP1' }).members.models[0]
    user.update({ memberIds: [...user.memberIds, otherMember.id] })
    schema.memberUsers.create({ userId: user.id, memberId: otherMember.id })
    for (const member of user.members.models) member.account.update({ balance: 0 })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('keeps sign-in until the last membership is deleted', async () => {
    await wrapper.vm.$router.push('/settings')
    await waitFor(() => wrapper.findComponent(DeleteMemberBtn).exists(), true)
    const email = wrapper.vm.$store.getters.myUser.attributes.email

    for (const lastMembership of [false, true]) {
      await wrapper.vm.$router.push('/settings')
      await waitFor(() => wrapper.findComponent(DeleteMemberBtn).exists(), true)
      const deletion = wrapper.getComponent(DeleteMemberBtn)
      await deletion.get("button[title='Delete account']").trigger('click')
      const dialog = deletion.getComponent(QDialog)
      const passwordField = deletion.getComponent(PasswordField)
      await waitFor(() => passwordField.isVisible(), true)
      expect(dialog.getComponent(QCard).text()).toContain("last community membership")
      await passwordField.get('input').setValue('password')
      const confirm = () => deletion.getComponent(QDialog).findAllComponents(QBtn)
        .find(button => button.text().includes('Delete account'))
      expect(confirm()).toBeDefined()
      if (lastMembership) {
        failNextMockIdentityDeletion()
        vi.mocked(Notify.create).mockClear()
        await confirm()?.trigger('click')
        await waitFor(() => vi.mocked(Notify.create).mock.calls.length > 0, true)
        expect(wrapper.vm.$store.getters.isLoggedIn).toBe(true)
        await deletion.get("button[title='Delete account']").trigger('click')
        await waitFor(() => deletion.getComponent(QDialog).props("modelValue"), true)
      }
      await confirm()?.trigger('click')
      await waitFor(() => wrapper.vm.$route.path, '/')
      expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false)

      if (lastMembership) {
        await expect(new Auth().login({ email, password: 'password' }))
          .rejects.toMatchObject({ code: 'IncorrectCredentials' })
      } else {
        await wrapper.vm.$router.push('/login-mail')
        await wrapper.get("input[type='email']").setValue(email)
        await wrapper.get("input[type='password']").setValue('password')
        await wrapper.get("button[type='submit']").trigger('click')
        await waitFor(() => wrapper.vm.$route.path, '/home')
        expect(wrapper.vm.$store.getters.myGroup.attributes.code).toBe('GRP1')
      }
    }
  })
})
