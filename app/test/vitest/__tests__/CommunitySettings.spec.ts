import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import { seeds } from 'src/server'
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
      expect(body.data).not.toHaveProperty('links')
      expect(body.data).not.toHaveProperty('relationships')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
