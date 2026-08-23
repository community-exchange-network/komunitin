import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import DeleteMemberBtn from 'src/pages/settings/DeleteMemberBtn.vue'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

describe('Member deletion', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.findBy('currency', { code: 'GRP0' })?.update({ admins: [] })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('reauthenticates with the current user email', async () => {
    await wrapper.vm.$router.push('/settings')
    await waitFor(
      () => wrapper.findComponent(DeleteMemberBtn).exists(),
      true,
      'Member deletion should load'
    )

    const component = wrapper.getComponent(DeleteMemberBtn)
    const member = component.props('member')

    const email = wrapper.vm.$store.getters.myUser.attributes.email
    const dispatch = vi.spyOn(wrapper.vm.$store, 'dispatch').mockResolvedValue(undefined)
    const componentVm = component.vm as unknown as {
      $: { setupState: {
        deleteMember: () => Promise<void>
        isAdmin: boolean
        password: string
        recipientAccount: typeof member.account
      } }
    }
    componentVm.$.setupState.password = 'password'
    componentVm.$.setupState.recipientAccount = member.account
    expect(componentVm.$.setupState.password).toBe('password')
    expect(componentVm.$.setupState.isAdmin).toBe(false)
    await componentVm.$.setupState.deleteMember()

    await waitFor(
      () => dispatch.mock.calls.some(([type]) => type === 'login'),
      true,
      'Reauthentication should be attempted'
    )
    expect(dispatch).toHaveBeenCalledWith('login', { email, password: 'password' })
  })
})
