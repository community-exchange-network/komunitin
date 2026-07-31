import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import SimpleMap from 'src/components/SimpleMap.vue'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

describe('Member profile without a location', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.members.first().update({ location: null })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('renders the profile and omits the map', async () => {
    const member = server.schema.members.first()
    await wrapper.vm.$router.push(`/groups/GRP0/members/${member.code}`)
    await waitFor(() => wrapper.text().includes(member.name), true, 'Member profile should load')

    expect(wrapper.findComponent(SimpleMap).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Unknown user interface error')
  })
})
