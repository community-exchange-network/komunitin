import type { VueWrapper } from '@vue/test-utils'
import { QBtn, QFile } from 'quasar'
import App from '../../../src/App.vue'
import { Auth } from '../../../src/plugins/Auth'
import server, { seeds } from '../../../src/server'
import { mockToken } from '../../../src/server/AuthServer'
import store from '../../../src/store'
import { auth } from '../../../src/store/me'
import { mountComponent, waitFor } from '../utils'
import { mockMigrations } from '../utils/migrations'

describe('Migrations', () => {
  let wrapper: VueWrapper

  afterEach(() => {
    wrapper.unmount()
    vi.restoreAllMocks()
  })

  it.each([false, true])('uploads a bundle and shows the completed migration (expired token: %s)', async (expiredToken) => {
    seeds()
    await store.dispatch('logout')
    await auth.processTokenResponse(mockToken(Auth.SCOPES, { superadmin: true, userId: server.schema.first('user').id }))
    const fetch = mockMigrations({ expiredToken })
    wrapper = await mountComponent(App, { login: 'cached', urlPath: '/superadmin/migrations/new' })
    await waitFor(() => wrapper.findComponent(QFile).exists(), true)

    const bundle = new File(['demo'], 'community.zip', { type: 'application/zip' })
    wrapper.getComponent(QFile).vm.$emit('update:modelValue', bundle)
    await wrapper.vm.$nextTick()
    await wrapper.findAllComponents(QBtn).find(button => button.props('label') === 'Import community').trigger('click')

    await waitFor(() => wrapper.text().includes('Completed'), true)
    await waitFor(() => wrapper.text().includes('Community import completed'), true)
    expect(wrapper.text()).toContain('BRAM')
    const uploads = fetch.mock.calls.filter(([url, options]) => String(url).endsWith('/migrations') && options?.method === 'POST')
    expect(uploads).toHaveLength(expiredToken ? 2 : 1)
    for (const [, options] of uploads) {
      expect(options.body).toBe(bundle)
      expect(new Headers(options.headers).get('Content-Type')).toBe('application/zip')
    }
  })
})
