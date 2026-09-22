import type { VueWrapper } from '@vue/test-utils'
import { QBtn, QCard, QDialog, QMenu } from 'quasar'
import App from 'src/App.vue'
import AccountHeader from 'src/components/AccountHeader.vue'
import SelectAccount from 'src/components/SelectAccount.vue'
import DeleteMemberBtn from 'src/pages/settings/DeleteMemberBtn.vue'
import ConfirmMemberDeletion from 'src/pages/settings/ConfirmMemberDeletion.vue'
import { Auth } from 'src/plugins/Auth'
import { getMockMemberDeletionLink } from 'src/server/AuthServer'
import { failNextMockIdentityDeletion } from 'src/server/SocialServer'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

// Mirage does not type registered model associations.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema = server.schema as any

describe('Member deletion', () => {
  let wrapper: VueWrapper

  beforeAll(() => seeds())
  afterEach(() => wrapper.unmount())

  it('deletes the last membership and identity after email confirmation without login', async () => {
    const user = schema.users.all().models[1]
    const member = user.members.models[0]
    member.account.update({ balance: 0 })
    wrapper = await mountComponent(App, { login: user })
    await wrapper.vm.$router.push('/settings')
    await waitFor(() => wrapper.findComponent(DeleteMemberBtn).exists(), true)
    const deletion = wrapper.getComponent(DeleteMemberBtn)
    await deletion.get("button[title='Delete account']").trigger('click')
    const dialog = deletion.getComponent(QDialog)
    await waitFor(() => dialog.getComponent(QCard).isVisible(), true)
    expect(dialog.getComponent(QCard).text()).toContain('send you an email')
    expect(dialog.find("input[type='password']").exists()).toBe(false)

    const previousLink = getMockMemberDeletionLink()
    await dialog.findAllComponents(QBtn).find(button => button.text() === 'Delete account').trigger('click')
    await waitFor(() => getMockMemberDeletionLink() !== previousLink, true)
    const link = getMockMemberDeletionLink()
    expect(member.deleted).toBeFalsy()

    // Follow the email in a browser with no logged-in session.
    await wrapper.vm.$store.dispatch('logout')
    await wrapper.vm.$router.push(link.replace(/token=.*/, 'token=invalid'))
    await waitFor(() => wrapper.findComponent(ConfirmMemberDeletion).exists(), true)
    const confirm = () => wrapper.getComponent(ConfirmMemberDeletion).findAllComponents(QBtn)
      .find(button => button.text() === 'Delete account')
    await confirm().trigger('click')
    await waitFor(() => wrapper.getComponent(ConfirmMemberDeletion).find('[role="alert"]').exists(), true)
    expect(member.deleted).toBeFalsy()

    await wrapper.vm.$router.push(link)
    expect(wrapper.vm.$store.getters.isLoggedIn).toBe(false)
    expect(member.deleted).toBeFalsy() // Merely opening the link does nothing.
    failNextMockIdentityDeletion()
    await confirm().trigger('click')
    await waitFor(() => wrapper.getComponent(ConfirmMemberDeletion).find('[role="alert"]').exists(), true)
    await confirm().trigger('click')
    await waitFor(() => wrapper.getComponent(ConfirmMemberDeletion).text().includes('Deleted'), true)
    expect(member.account.balance).toBe(0)
    expect(member.account.status).toBe('deleted')
    await expect(new Auth().login({ email: user.email, password: 'password' }))
      .rejects.toMatchObject({ code: 'IncorrectCredentials' })
  })

  it('lets an admin settle a negative balance and delete another member without email', async () => {
    const member = schema.groups.findBy({ code: 'GRP0' }).members.models[11]
    member.account.update({ balance: -50 })
    wrapper = await mountComponent(App, { login: true })
    await wrapper.vm.$router.push(`/groups/GRP0/admin/members/${member.code}/settings`)
    await waitFor(() => wrapper.findComponent(DeleteMemberBtn).exists()
      && wrapper.getComponent(DeleteMemberBtn).props('member').account?.attributes.balance === -50, true)
    const deletion = wrapper.getComponent(DeleteMemberBtn)
    await deletion.get("button[title='Delete account']").trigger('click')
    const dialog = deletion.getComponent(QDialog)
    await waitFor(() => dialog.getComponent(QCard).isVisible(), true)
    expect(dialog.getComponent(QCard).text()).not.toContain('send you an email')

    const select = deletion.getComponent(SelectAccount)
    await select.get('input').trigger('click')
    await waitFor(() => select.findComponent(QMenu).exists()
      && select.getComponent(QMenu).findAllComponents(AccountHeader).length > 1, true)
    const recipient = select.getComponent(QMenu).findAllComponents(AccountHeader)
      .find(option => option.props('account').id !== member.account.id)
    const recipientAccount = schema.accounts.find(recipient.props('account').id)
    const recipientBalance = recipientAccount.balance
    await recipient.trigger('click')

    const transfers = schema.transfers.all().length
    const previousLink = getMockMemberDeletionLink()
    await dialog.findAllComponents(QBtn).find(button => button.text() === 'Delete account').trigger('click')
    await waitFor(() => !!schema.members.find(member.id).deleted, true)
    expect(member.account.balance).toBe(0)
    expect(member.account.status).toBe('deleted')
    expect(schema.transfers.all().length).toBe(transfers + 1)
    expect(schema.accounts.find(recipientAccount.id).balance).toBe(recipientBalance - 50)
    expect(getMockMemberDeletionLink()).toBe(previousLink)
  })
})
