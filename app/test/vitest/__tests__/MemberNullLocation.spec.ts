import type { VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import SimpleMap from '@/components/SimpleMap.vue'
import server, { seeds } from '@/server'
import { mountComponent, waitFor } from '../utils'

describe('Member without a location', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    const member = (server.schema as any).members.first()
    member.update({ location: null })
    const need = member.posts.models.find(post => post.type === 'needs')
    const urlPath = `/groups/GRP0/needs/${need.code}`
    // Sign in from another community so the want's group is not already cached.
    const visitor = (server.schema as any).users.all().models.find(user =>
      user.members.models.some(member => member.group.code === 'GRP1')
    )
    window.history.replaceState({}, '', urlPath)
    wrapper = await mountComponent(App, { login: visitor, urlPath })
  })

  afterAll(() => {
    wrapper.unmount()
    window.history.replaceState({}, '', '/')
  })

  it.each(['needs', 'members', 'offers'])('renders %s with a markerless map centered on the group', async (type) => {
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
