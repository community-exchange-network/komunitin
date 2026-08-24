import type { VueWrapper } from '@vue/test-utils'
import { QBtn, QDialog } from 'quasar'
import App from 'src/App.vue'
import PasswordField from 'src/components/PasswordField.vue'
import DeleteMemberBtn from 'src/pages/settings/DeleteMemberBtn.vue'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

describe('Member deletion', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.findBy('currency', { code: 'GRP0' })?.update({ admins: [] })
    server.schema.first('account')?.update({ balance: 0 })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('lets a member confirm account deletion with their password', async () => {
    await wrapper.vm.$router.push('/settings')
    await waitFor(
      () => wrapper.text().includes('Delete account'),
      true,
      'Account deletion should load'
    )

    const deletion = wrapper.getComponent(DeleteMemberBtn)
    const deleteButton = deletion.get("button[title='Delete account']")
    await deleteButton.trigger('click')

    const dialog = deletion.getComponent(QDialog)
    const passwordField = deletion.getComponent(PasswordField)
    await waitFor(
      () => passwordField.isVisible(),
      true,
      'Account deletion confirmation should open'
    )
    await passwordField.get('input').setValue('password')

    const confirmButton = dialog.findAllComponents(QBtn)
      .find(button => button.text().includes('Delete account'))
    expect(confirmButton, 'Confirm deletion button should be visible').toBeDefined()
    await confirmButton?.trigger('click')

    await waitFor(
      () => wrapper.text().includes('Already registered to a local community?'),
      true,
      'Deleted member should return to the logged-out page'
    )
    expect(wrapper.text()).toContain('Log in')
  })
})
