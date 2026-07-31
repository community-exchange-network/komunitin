import type { VueWrapper } from '@vue/test-utils'
import { QBtn, QDialog, QInput } from 'quasar'
import App from 'src/App.vue'
import CategoriesField from 'src/pages/admin/CategoriesField.vue'
import { seeds } from 'src/server'
import { config } from 'src/utils/config'
import { mountComponent, waitFor } from '../utils'

describe('Category updates', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('sends writable category fields only', async () => {
    await wrapper.vm.$router.push('/groups/GRP0/admin/settings')
    await waitFor(() => wrapper.findComponent(CategoriesField).exists(), true, 'Categories should load')

    const categories = wrapper.getComponent(CategoriesField)
    const edit = categories.findAllComponents(QBtn).find(button => button.props('icon') === 'edit')
    expect(edit).toBeDefined()
    await edit?.trigger('click')
    const editDialog = categories.findAllComponents(QDialog).at(-1)
    await waitFor(() => editDialog.props('modelValue'), true, 'Edit dialog should open')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      await editDialog.getComponent(QInput).get('input').setValue('Updated category')
      const save = editDialog.findAllComponents(QBtn)
        .find(button => button.text() === 'Save')
      expect(save).toBeDefined()
      await save?.trigger('click')

      await waitFor(
        () => fetchSpy.mock.calls.some(([url, options]) =>
          typeof url === 'string'
          && url.startsWith(`${config.SOCIAL_URL}/GRP0/categories/`)
          && options?.method === 'PATCH'
        ),
        true,
        'Category PATCH should be sent'
      )
      const request = fetchSpy.mock.calls.find(([url, options]) =>
        typeof url === 'string'
        && url.startsWith(`${config.SOCIAL_URL}/GRP0/categories/`)
        && options?.method === 'PATCH'
      )
      const body = JSON.parse(request?.[1]?.body as string)
      expect(Object.keys(body.data)).toEqual(['id', 'type', 'attributes'])
      expect(Object.keys(body.data.attributes)).toEqual(['name', 'icon'])
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
