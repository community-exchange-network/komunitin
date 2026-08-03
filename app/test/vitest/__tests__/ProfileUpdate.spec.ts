import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import { seeds } from 'src/server'
import { config } from 'src/utils/config'
import { mountComponent, waitFor } from '../utils'

describe('Existing profile updates', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('sends writable member attributes only', async () => {
    await wrapper.vm.$router.push('/profile')
    await waitFor(() => wrapper.find("input[name='name']").exists(), true, 'Profile form should load')

    const memberId = wrapper.vm.$store.getters.myMember.id
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      await wrapper.get("input[name='name']").setValue('Updated profile name')
      await waitFor(
        () => fetchSpy.mock.calls.some(([url, options]) =>
          url === `${config.SOCIAL_URL}/GRP0/members/${memberId}` && options?.method === 'PATCH'
        ),
        true,
        'Member PATCH should be sent',
        3000
      )
      const request = fetchSpy.mock.calls.find(([url, options]) =>
        url === `${config.SOCIAL_URL}/GRP0/members/${memberId}` && options?.method === 'PATCH'
      )
      const body = JSON.parse(request?.[1]?.body as string)
      expect(Object.keys(body.data.attributes)).toEqual([
        'image',
        'name',
        'description',
        'location',
        'address'
      ])
      expect(body.data.attributes.name).toBe('Updated profile name')
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
