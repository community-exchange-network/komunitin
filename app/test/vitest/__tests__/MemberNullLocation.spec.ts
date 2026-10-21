import type { VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import SimpleMap from '@/components/SimpleMap.vue'
import server, { seeds } from '@/server'
import { mountComponent, waitFor } from '../utils'

describe('Member without a location', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.members.first().update({ location: null })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it.each(['members', 'offers', 'needs'])('renders %s with a markerless map centered on the group', async (type) => {
    const member = server.schema.members.first()
    const resource = type === 'members' ? member : member.posts.models.find(post => post.type === type)
    await wrapper.vm.$router.push(`/groups/GRP0/${type}/${resource.code}`)
    await waitFor(() => wrapper.findComponent(SimpleMap).exists(), true, 'Resource map should load')

    const map = wrapper.findComponent(SimpleMap)
    expect(map.props('center')).toEqual(member.group.location.coordinates)
    expect(map.props('marker')).toBeUndefined()
    expect(map.findComponent({ name: 'LMarker' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Unknown user interface error')
  })
})
