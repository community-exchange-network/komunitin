import type { VueWrapper } from '@vue/test-utils'
import App from '@/App.vue'
import ContactButton from '@/components/ContactButton.vue'
import ShareButton from '@/components/ShareButton.vue'
import SimpleMap from '@/components/SimpleMap.vue'
import server, { seeds } from '@/server'
import { mountComponent, waitFor } from '../utils'
import { createPost } from '../utils/posts'

describe('Post details', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.first('member').update({ location: null })
    createPost('offers', 'Uncategorized-offer', { expires: null, images: [] })
      .update({ categoryId: null })
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('shows an offer without a category, expiry or member location', async () => {
    const description = 'Uncategorized-offer'
    await wrapper.vm.$router.push(`/groups/GRP0/offers/${description}`)
    await waitFor(() => wrapper.text().includes(description), true, 'Post details should load')

    expect(wrapper.text()).not.toContain('Expires')
    expect(wrapper.text()).toContain('local_offer')
    expect(wrapper.getComponent(SimpleMap).props('marker')).toBeUndefined()
    expect(wrapper.getComponent(ShareButton).props('text')).toContain(description)
    const contacts = wrapper.vm.$store.getters.myMember.attributes.contacts
    expect(wrapper.getComponent(ContactButton).props('contacts')).toEqual(contacts)
  })
})
