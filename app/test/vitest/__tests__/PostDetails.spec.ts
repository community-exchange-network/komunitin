import type { VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import ContactButton from '@/components/ContactButton.vue'
import ShareButton from '@/components/ShareButton.vue'
import SimpleMap from '@/components/SimpleMap.vue'
import server, { seeds } from '@/server'
import { mountComponent, waitFor } from '../utils'
import { createPost } from '../utils/posts'

describe('Post details with optional fields', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.first('member').update({ location: null })
    for (const type of ['offers', 'needs'] as const) {
      createPost(type, `Uncategorized-${type}`, { expires: null })
        .update({ categoryId: null })
    }
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it.each(['offers', 'needs'] as const)('renders %s without a category, expiry or location and keeps contact/share content', async (type) => {
    const description = `Uncategorized-${type}`
    await wrapper.vm.$router.push(`/groups/GRP0/${type}/${description}`)
    await waitFor(() => wrapper.text().includes(description), true, 'Post details should load')

    expect(wrapper.text()).not.toContain('Expires')
    expect(wrapper.getComponent(SimpleMap).props('marker')).toBeUndefined()
    expect(wrapper.getComponent(ShareButton).props('text')).toContain(description)
    const contacts = wrapper.vm.$store.getters.myMember.attributes.contacts
    expect(contacts.length).toBeGreaterThan(0)
    expect(wrapper.getComponent(ContactButton).props('contacts')).toEqual(contacts)
    expect(wrapper.text()).not.toContain('Unknown user interface error')
  })
})
