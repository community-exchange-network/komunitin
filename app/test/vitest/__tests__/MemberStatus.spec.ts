import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import ConfirmBtn from 'src/components/ConfirmBtn.vue'
import MemberStatusChip from 'src/components/MemberStatusChip.vue'
import MemberStatusField from 'src/pages/settings/MemberStatusField.vue'
import server, { seeds } from 'src/server'
import type { Account, Member } from 'src/store/model'
import { config } from 'src/utils/config'
import { mountComponent, waitFor } from '../utils'

describe('Member status settings', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('suspends, resumes, disables and enables another member through Social only', async () => {
    const target = (server.schema as unknown as {
      members: { all: () => { models: Array<{ id: string, code: string }> } }
    }).members.all().models[1]

    await wrapper.vm.$router.push(`/groups/GRP0/admin/members/${target.code}/settings`)
    await waitFor(
      () => wrapper.findComponent(MemberStatusField).exists(),
      true,
      'Member status settings should load',
    )
    await waitFor(
      () => Boolean(wrapper.vm.$store.getters['members/one'](target.id)?.account),
      true,
      'Member account should load',
    )

    const member = wrapper.vm.$store.getters['members/one'](target.id) as Member & { account: Account }
    const memberUrl = `${config.SOCIAL_URL}/GRP0/members/${member.id}`
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const memberPatches = () => fetchSpy.mock.calls.filter(([url, options]) =>
      String(url) === memberUrl && options?.method === 'PATCH'
    )
    const transition = async (label: string, status: Account['attributes']['status'], count: number) => {
      const field = wrapper.getComponent(MemberStatusField)
      const action = field.findAllComponents(ConfirmBtn)
        .find((button) => button.props('label') === label)
      expect(action, `${label} action should be available`).toBeDefined()

      action.vm.$emit('confirm')

      await waitFor(
        () => wrapper.getComponent(MemberStatusChip).props('status'),
        status,
        `Member status should become ${status}`,
      )
      await waitFor(
        () => (wrapper.vm.$store.getters['accounts/one'](member.account.id) as Account).attributes.status,
        status,
        `Account status should refresh to ${status}`,
      )
      await waitFor(() => memberPatches().length, count)
    }
    const actions = () => wrapper.getComponent(MemberStatusField)
      .findAllComponents(ConfirmBtn)
      .map((button) => button.props('label'))

    try {
      await transition('Suspend Account', 'suspended', 1)
      expect(actions()).toEqual(['Enable Account'])
      await transition('Enable Account', 'active', 2)
      expect(actions()).toEqual(['Disable Account', 'Suspend Account'])
      await transition('Disable Account', 'disabled', 3)
      expect(actions()).toEqual(['Enable Account'])
      await transition('Enable Account', 'active', 4)
      expect(actions()).toEqual(['Disable Account', 'Suspend Account'])

      const statuses = memberPatches().map(([, options]) => {
        const body = JSON.parse(options?.body as string)
        expect(body.data.attributes).not.toHaveProperty('state')
        return body.data.attributes.status
      })
      expect(statuses).toEqual(['suspended', 'active', 'disabled', 'active'])
      const accountGets = fetchSpy.mock.calls.filter(([url, options]) =>
        String(url).startsWith(config.ACCOUNTING_URL) && options?.method === 'GET'
      )
      expect(accountGets).toHaveLength(4)
      expect(accountGets.every(([url]) =>
        !new URL(String(url)).searchParams.has('include')
      )).toBe(true)
      expect(fetchSpy.mock.calls.some(([url, options]) =>
        String(url).startsWith(config.ACCOUNTING_URL) && options?.method === 'PATCH'
      )).toBe(false)
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
