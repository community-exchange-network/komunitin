import type { VueWrapper } from '@vue/test-utils'
import { Notify } from 'quasar'
import App from 'src/App.vue'
import OfferForm from 'src/pages/offers/OfferForm.vue'
import NeedForm from 'src/pages/needs/NeedForm.vue'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

// Mirage's registered associations are not represented by its schema types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const schema = server.schema as any

describe('Post edit route access', () => {
  let wrapper: VueWrapper
  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
    await wrapper.vm.$router.push('/groups')
  })
  afterAll(() => wrapper.unmount())

  for (const type of ['offers', 'needs']) {
    it.each(['owner', 'unrelated', 'other-community-admin', 'admin', 'superadmin'])(`${type}: %s`, async role => {
      await wrapper.vm.$router.push('/groups')
      await wrapper.vm.$store.dispatch('logout')
      const user = schema.users.first()
      const ownMember = schema.members.first()
      const group = schema.groups.findBy({ code: role === 'other-community-admin' ? 'GRP1' : 'GRP0' })
      const owner = role === 'owner' ? ownMember : group.members.models[1]
      const post = schema.posts.findBy({ type })
      user.update({ members: ['unrelated', 'superadmin'].includes(role) ? [] : [ownMember] })
      schema.currencies.findBy({ code: 'GRP0' }).update({
        admins: ['admin', 'other-community-admin'].includes(role) ? [user] : []
      })
      await wrapper.vm.$store.dispatch('login', {
        email: role === 'superadmin' ? 'superadmin@example.com' : 'example@example.com',
        password: 'password'
      })
      if (role === 'other-community-admin') {
        expect(wrapper.vm.$store.getters.myGroup.attributes.code).toBe('GRP0')
        expect(wrapper.vm.$store.getters.myMember.id).not.toBe(owner.id)
      }
      post.update({ memberId: owner.id, groupId: group.id, status: 'published' })
      vi.mocked(Notify.create).mockClear()
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
      try {
        await wrapper.vm.$router.push(`/groups/${group.code}/${type}/${post.code}/edit`)
        if (['unrelated', 'other-community-admin'].includes(role)) {
          await waitFor(() => wrapper.vm.$route.path, '/404')
          expect(wrapper.findComponent(OfferForm).exists()).toBe(false)
          expect(wrapper.findComponent(NeedForm).exists()).toBe(false)
          expect(wrapper.text()).toContain('Sorry, nothing here...')
        } else {
          await waitFor(() => wrapper.findComponent(type === 'offers' ? OfferForm : NeedForm).exists(), true)
          expect(wrapper.text()).toContain('Save')
          if (type === 'offers') expect(wrapper.text()).toContain(group.currency.symbol)
        }
        expect(fetchSpy.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false)
        expect(Notify.create).not.toHaveBeenCalled()
      } finally {
        fetchSpy.mockRestore()
      }
    })
  }

  it.each(['offers', 'needs'])('redirects a missing %s editor to 404', async type => {
    await wrapper.vm.$router.push(`/groups/GRP0/${type}/missing/edit`)
    await waitFor(() => wrapper.vm.$route.path, '/404')
    expect(wrapper.findComponent(OfferForm).exists()).toBe(false)
    expect(wrapper.findComponent(NeedForm).exists()).toBe(false)
  })
})
