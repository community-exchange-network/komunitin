import type { VueWrapper } from '@vue/test-utils'
import { QBtn } from 'quasar'

import App from 'src/App.vue'
import Error404 from 'src/pages/Error404.vue'
import { seeds } from 'src/server'
import { mountComponent, waitFor } from '../utils'

describe('Not found pages', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  test.each([
    ['/groups/GRP0/offers/missing-offer', '/groups/GRP0/offers'],
    ['/groups/GRP0/needs/missing-need', '/groups/GRP0/needs'],
    ['/groups/GRP0/members/missing-member', '/groups/GRP0/members'],
    ['/groups/missing-community', '/groups']
  ])('renders a resource 404 for %s and returns to its list', async (path, destination) => {
    await wrapper.vm.$router.push(path)
    await waitFor(() => wrapper.findComponent(Error404).exists(), true, '404 page should load')

    const errorPage = wrapper.getComponent(Error404)
    expect(errorPage.text()).toContain('Sorry, nothing here...')
    expect(errorPage.get('img').attributes('src')).toContain('acorn-512.png')
    expect(errorPage.getComponent(QBtn).props()).toMatchObject({
      label: 'Back',
      to: destination
    })

    await errorPage.getComponent(QBtn).trigger('click')
    await waitFor(() => wrapper.vm.$route.path, destination, 'Back should open the resource list')
  })

  test('renders an unknown route in the main app shell and returns home', async () => {
    await wrapper.vm.$router.push('/missing-route')
    await waitFor(() => wrapper.findComponent(Error404).exists(), true, 'Generic 404 page should load')

    expect(wrapper.find('#layout').exists()).toBe(true)
    const button = wrapper.getComponent(Error404).getComponent(QBtn)
    expect(button.props('to')).toBe('/')

    await button.trigger('click')
    await waitFor(() => wrapper.vm.$route.path, '/home', 'The default destination should apply the logged-in redirect')
  })
})
