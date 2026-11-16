import type { VueWrapper } from '@vue/test-utils'
import { onTestFinished, vi } from 'vitest'
import { QBtn, QDialog, QInput } from 'quasar'
import ToggleItem from '@/components/ToggleItem.vue'
import CommunitySettingsNav from '@/pages/admin/settings/CommunitySettingsNav.vue'
import IconPicker from '@/pages/admin/settings/IconPicker.vue'
import server from '@/server'
import { waitFor } from './index'

export const settingsPath = '/groups/GRP0/admin/settings'

/** Find controls by their visible labels, including controls in teleported dialogs. */
export const settingsControls = (wrapper: VueWrapper) => {
  const button = (label: string, scope: Pick<VueWrapper, 'findAllComponents'> = wrapper) =>
    scope.findAllComponents(QBtn).find(button => button.text() === label)!
  const input = (label: string) => wrapper.findAllComponents(QInput)
    .find(input => input.props('label') === label)!.get<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
  const toggle = (label: string) => wrapper.findAllComponents(ToggleItem)
    .find(toggle => toggle.props('label') === label)!.get('[role="switch"]')

  const openSection = async (section: string) => {
    await wrapper.vm.$router.push(settingsPath)
    const link = wrapper.getComponent(CommunitySettingsNav).get(`a[href$="/${section}"]`)
    const title = link.get('.q-item__section--main').text()
    await link.trigger('click')
    await waitFor(() => wrapper.vm.$route.path, `${settingsPath}/${section}`)
    await waitFor(() => wrapper.element.querySelector('.q-page h1, .q-page .text-title-medium')?.textContent?.trim(), title)
  }

  const confirm = async (control: Pick<VueWrapper, 'get' | 'getComponent'>) => {
    await control.get('button').trigger('click')
    const dialog = control.getComponent(QDialog)
    await dialog.findAllComponents(QBtn).find(button => button.props('unelevated'))!.trigger('click')
  }

  const saveCategory = async (categories: Pick<VueWrapper, 'findAllComponents'>, name: string, icon: string) => {
    const dialog = categories.findAllComponents(QDialog).at(-1)!
    await dialog.getComponent(QInput).get('input').setValue(name)
    await waitFor(() => dialog.findComponent(IconPicker).exists(), true)
    const picker = dialog.getComponent(IconPicker)
    await picker.get('input').setValue(icon)
    await waitFor(() => picker.find(`button#${icon}`).exists(), true)
    await picker.get(`button#${icon}`).trigger('click')
    await button('Save', dialog).trigger('click')
  }

  return { button, input, toggle, openSection, confirm, saveCategory }
}

/** Check each successful PATCH at the HTTP boundary, then start a fresh capture. */
export const captureSettingsPatches = () => {
  const requests = vi.spyOn(server.pretender, 'handledRequest')
  onTestFinished(() => requests.mockRestore())
  return async (url: string | RegExp, attributes: Record<string, unknown>) => {
    const request = () => requests.mock.calls.findLast(([method, requestUrl]) =>
      (typeof url === 'string' ? requestUrl === url : url.test(requestUrl)) && method === 'PATCH'
    )?.[2]
    await waitFor(() => !!request(), true)
    expect(request()!.status).toBe(200)
    const body = JSON.parse(request()!.requestBody)
    expect(Object.keys(body.data).sort()).toEqual(['attributes', 'id', 'type'])
    expect(body.data.attributes).toEqual(attributes)
    requests.mockClear()
  }
}
