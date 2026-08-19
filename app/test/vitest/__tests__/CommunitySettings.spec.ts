import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import ConfirmBtn from 'src/components/ConfirmBtn.vue'
import GroupStatusField from 'src/pages/admin/GroupStatusField.vue'
import { seeds } from 'src/server'
import store from 'src/store'
import { config } from 'src/utils/config'
import { mountComponent, waitFor } from '../utils'

describe('Community settings', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('updates settings with writable JSON:API fields only', async () => {
    await wrapper.vm.$router.push('/groups/GRP0/admin/settings')
    await waitFor(() => wrapper.text().includes('Community Settings'), true)

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      await waitFor(
        () => wrapper.findAll("input[type='number']").length > 0,
        true,
        'Community settings fields should load'
      )
      // Update the minOffers field to trigger a PATCH request
      await wrapper.findAll("input[type='number']")[0].setValue('2')

      await waitFor(
        () => fetchSpy.mock.calls.some(([url, options]) =>
          url === `${config.SOCIAL_URL}/GRP0/settings` && options?.method === 'PATCH'
        ),
        true,
        'Settings PATCH should be sent',
        3000
      )
      const request = fetchSpy.mock.calls.find(([url, options]) =>
        url === `${config.SOCIAL_URL}/GRP0/settings` && options?.method === 'PATCH'
      )
      const body = JSON.parse(request?.[1]?.body as string)
      expect(Object.keys(body.data)).toEqual(['id', 'type', 'attributes'])
      expect(body.data.attributes.minOffers).toBe(2)
    } finally {
      fetchSpy.mockRestore()
    }
  })

  it('shows the updated community status after disabling and enabling it', async () => {
    await wrapper.vm.$router.push('/groups/GRP0/admin/settings')
    await waitFor(
      () => wrapper.findComponent(GroupStatusField).exists(),
      true,
      'Community status field should load',
    )

    const actionLabels = () => wrapper.getComponent(GroupStatusField)
      .findAllComponents(ConfirmBtn)
      .map((button) => button.props('label'))
    const transition = async (
      actionLabel: string,
      statusText: string,
      nextActionLabel: string,
      status: 'active' | 'disabled',
    ) => {
      const statusField = wrapper.getComponent(GroupStatusField)
      const action = statusField.findAllComponents(ConfirmBtn)
        .find((button) => button.props('label') === actionLabel)
      expect(action, `${actionLabel} action should be available`).toBeDefined()

      action?.vm.$emit('confirm')

      await waitFor(
        () => wrapper.getComponent(GroupStatusField).text().includes(statusText),
        true,
        `Community status should show "${statusText}"`,
      )
      expect(actionLabels()).toEqual([nextActionLabel])
      await waitFor(
        () => store.getters['currencies/find']({ code: 'GRP0' }).attributes.status,
        status,
        `Currency status should be "${status}"`,
      )
    }

    expect(wrapper.getComponent(GroupStatusField).text()).toContain('The community is active.')
    expect(actionLabels()).toEqual(['Disable Community'])

    await transition(
      'Disable Community',
      'The community is disabled. Members are not able to log in or make transfers.',
      'Enable Community',
      'disabled',
    )
    await transition('Enable Community', 'The community is active.', 'Disable Community', 'active')
  })
})
