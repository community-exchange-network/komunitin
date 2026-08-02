import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import SimpleMap from 'src/components/SimpleMap.vue'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

describe('Member profile without a location', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.members.first().update({ address: {}, location: null })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('renders the profile with a markerless map centered on the group', async () => {
    const member = server.schema.members.first()
    await wrapper.vm.$router.push(`/groups/GRP0/members/${member.code}`)
    await waitFor(() => wrapper.text().includes(member.name), true, 'Member profile should load')

    const map = wrapper.findComponent(SimpleMap)
    expect(map.props('center')).toEqual(member.group.location.coordinates)
    expect(map.props('marker')).toBeUndefined()
    expect(map.findComponent({ name: 'LMarker' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Unknown user interface error')
  })
})
