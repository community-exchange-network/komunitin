import type { VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import server, { seeds } from '@/server'
import { config } from '@/utils/config'
import { mountComponent, waitFor } from '../utils'

describe('Existing profile updates', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    const member = (server.schema as any).members.first()
    member.update({ location: null })
    member.group.update({ location: null })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('saves a profile when neither the member nor the community has a location', async () => {
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
      expect(body.data.attributes.location).toBeNull()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
