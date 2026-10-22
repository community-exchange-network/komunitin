import type { VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import SimpleMap from '@/components/SimpleMap.vue'
import server, { seeds } from '@/server'
import { mountComponent, waitFor } from '../utils'

describe('Member profile without a location', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.members.first().update({ location: null })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it.each([false, true])('renders a markerless profile map with desktop layout %s', async (desktop) => {
    wrapper.vm.$q.screen.gt.sm = desktop
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
