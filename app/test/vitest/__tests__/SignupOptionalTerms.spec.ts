import type { VueWrapper } from '@vue/test-utils'
import App from 'src/App.vue'
import server, { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

describe('Signup without configured terms', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    server.schema.groupSettings.first().update({
      requireAcceptTerms: undefined,
      terms: undefined
    })
    wrapper = await mountComponent(App)
  })

  afterAll(() => wrapper.unmount())

  it('continues directly to credentials', async () => {
    await wrapper.vm.$router.push('/groups/GRP0/signup')
    await waitFor(() => wrapper.find("input[name='name']").exists(), true, 'Credentials form should load')

    expect(wrapper.text()).toContain('Set your credentials')
    expect(wrapper.text()).not.toContain('Membership terms')
    expect(wrapper.text()).not.toContain('Unknown user interface error')
  })
})
