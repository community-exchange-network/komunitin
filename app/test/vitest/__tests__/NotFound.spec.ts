import type { VueWrapper } from '@vue/test-utils'
import { Notify, QBtn } from 'quasar'

import App from 'src/App.vue'
import KError, { KErrorCode } from 'src/KError'
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(Notify.create).mockClear()

    try {
      await wrapper.vm.$router.push(path)
      await waitFor(() => wrapper.findComponent(Error404).exists(), true, '404 page should load')

      const errorPage = wrapper.getComponent(Error404)
      expect(errorPage.text()).toContain('Sorry, nothing here...')
      expect(errorPage.get('img').attributes('src')).toContain('acorn-512.png')
      expect(errorPage.getComponent(QBtn).props()).toMatchObject({
        label: 'Back',
        to: destination
      })
      expect(Notify.create).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Error: Resource not found'
      }))

      await errorPage.getComponent(QBtn).trigger('click')
      await waitFor(() => wrapper.vm.$route.path, destination, 'Back should open the resource list')
    } finally {
      consoleError.mockRestore()
    }
  })

  test('reports non-NotFound resource errors without rendering a 404', async () => {
    const originalDispatch = wrapper.vm.$store.dispatch.bind(wrapper.vm.$store)
    const dispatch = vi.spyOn(wrapper.vm.$store, 'dispatch').mockImplementation((type, payload) =>
      String(type) === 'groups/load'
        ? Promise.reject(new KError(KErrorCode.UnknownServer))
        : originalDispatch(type, payload)
    )
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(Notify.create).mockClear()

    try {
      await wrapper.vm.$router.push('/groups/unavailable-community')
      await waitFor(
        () => vi.mocked(Notify.create).mock.calls.length > 0,
        true,
        'The global error handler should notify the user'
      )

      expect(wrapper.findComponent(Error404).exists()).toBe(false)
    } finally {
      consoleError.mockRestore()
      dispatch.mockRestore()
    }
  })

  test('reports unhandled promise rejections', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const event = new Event('unhandledrejection', { cancelable: true })
    Object.defineProperty(event, 'reason', {
      value: new KError(KErrorCode.UnknownServer)
    })
    vi.mocked(Notify.create).mockClear()

    try {
      window.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
      expect(Notify.create).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Error: Unexpected response from server'
      }))
    } finally {
      consoleError.mockRestore()
    }
  })

  test('normalizes global script errors', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(Notify.create).mockClear()

    try {
      window.dispatchEvent(new ErrorEvent('error', {
        error: new Error('Script failed'),
        message: 'Script failed'
      }))

      expect(consoleError).toHaveBeenCalledWith('[UnknownScript] Script failed')
      expect(Notify.create).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Error: Unknown script error'
      }))
    } finally {
      consoleError.mockRestore()
    }
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
