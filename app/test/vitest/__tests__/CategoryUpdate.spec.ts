import type { VueWrapper } from '@vue/test-utils'
import { QBtn, QDialog, QInput } from 'quasar'
import App from '@/App.vue'
import CategoriesField from '@/pages/admin/CategoriesField.vue'
import IconPicker from '@/pages/admin/IconPicker.vue'
import { seeds } from '@/server'
import { config } from '@/utils/config'
import { mountComponent, waitFor } from '../utils'

describe('Category updates', () => {
  let wrapper: VueWrapper

  beforeAll(async () => {
    seeds()
    wrapper = await mountComponent(App, { login: true })
  })

  afterAll(() => wrapper.unmount())

  it('saves a selected Material Symbol and sends writable category fields only', async () => {
    await wrapper.vm.$router.push('/groups/GRP0/admin/settings')
    await waitFor(() => wrapper.findComponent(CategoriesField).exists(), true, 'Categories should load')

    const categories = wrapper.getComponent(CategoriesField)
    expect(categories.findComponent(IconPicker).exists()).toBe(false)
    const edit = categories.findAllComponents(QBtn).find(button => button.props('icon') === 'edit')
    expect(edit).toBeDefined()
    await edit?.trigger('click')
    const editDialog = categories.findAllComponents(QDialog).at(-1)
    await waitFor(() => editDialog.props('modelValue'), true, 'Edit dialog should open')

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    try {
      await editDialog.getComponent(QInput).get('input').setValue('Updated category')
      await waitFor(() => editDialog.findComponent(IconPicker).exists(), true, 'Icon picker should load')
      const picker = editDialog.getComponent(IconPicker)
      await picker.get('input').setValue('garden_cart')
      await waitFor(() => picker.find('button#garden_cart').exists(), true, 'Garden cart should be available')
      await picker.get('button#garden_cart').trigger('click')

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
      expect(body.data.attributes.icon).toEqual({ type: 'material', value: 'garden_cart' })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
