import type { VueWrapper } from '@vue/test-utils'
import { QBtn, QDialog, QInput } from 'quasar'
import App from '@/App.vue'
import ConfirmBtn from '@/components/ConfirmBtn.vue'
import DeleteBtn from '@/components/DeleteBtn.vue'
import InputUpdate from '@/components/InputUpdate.vue'
import SaveChanges from '@/components/SaveChanges.vue'
import CategoriesField from '@/pages/admin/settings/CategoriesField.vue'
import CommunitySettingsNav from '@/pages/admin/settings/CommunitySettingsNav.vue'
import GroupStatusField from '@/pages/admin/settings/GroupStatusField.vue'
import IconPicker from '@/pages/admin/settings/IconPicker.vue'
import TrustlinesField from '@/pages/admin/settings/TrustlinesField.vue'
import { seeds } from '@/server'
import { config } from '@/utils/config'
import { mountComponent, pauseRequests, waitFor } from '../utils'
import { captureSettingsPatches, settingsControls, settingsPath } from '../utils/communitySettings'

describe('Community settings', () => {
  let wrapper: VueWrapper
  let controls: ReturnType<typeof settingsControls>
  let expectPatch: ReturnType<typeof captureSettingsPatches>
  const social = `${config.SOCIAL_URL}/GRP0`
  const accounting = `${config.ACCOUNTING_URL}/GRP0`
  const terms = 'Community exchange agreements'
  const originalWidth = window.innerWidth

  beforeAll(async () => {
    seeds()
    window.innerWidth = 600
    wrapper = await mountComponent(App, { login: true })
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => wrapper.vm.$q.screen.lt.md, true)
    controls = settingsControls(wrapper)
  })

  beforeEach(() => { expectPatch = captureSettingsPatches() })
  afterAll(() => {
    wrapper.unmount()
    window.innerWidth = originalWidth
    window.dispatchEvent(new Event('resize'))
  })

  it('opens the mobile index and keeps Back as history navigation for direct links', async () => {
    await wrapper.vm.$router.push(settingsPath)
    const sections = ['signup', 'marketplace', 'emails', 'external-transfers', 'permissions', 'account-rules']
    if (import.meta.env.FEAT_TOPUP === 'true') sections.push('contributions')
    sections.push('status')
    expect(wrapper.getComponent(CommunitySettingsNav).findAll('a').map(link => link.attributes('href')))
      .toEqual(sections.map(section => `${settingsPath}/${section}`))
    expect(wrapper.find('h1').exists()).toBe(false)

    await wrapper.vm.$router.push('/home')
    await wrapper.vm.$router.push(`${settingsPath}/emails`)
    await waitFor(() => wrapper.element.querySelector('h1')?.textContent, 'Emails')
    expect(wrapper.findComponent(CommunitySettingsNav).exists()).toBe(false)
    await wrapper.get('button#back').trigger('click')
    await waitFor(() => wrapper.vm.$route.path, '/home')
  })

  it('saves signup counts and initial credit, and flushes pending terms when leaving', async () => {
    await controls.openSection('signup')
    await controls.input(wrapper.vm.$t('minOffers')).setValue('2')
    await expectPatch(`${social}/settings`, { minOffers: 2 })
    await controls.input(wrapper.vm.$t('initialCredit')).setValue('25')
    await expectPatch(`${accounting}/currency/settings`, { defaultInitialCreditLimit: 250000 })

    const textarea = controls.input(wrapper.vm.$t('termsOfUse'))
    textarea.element.value = terms
    await textarea.trigger('input')
    await wrapper.get('button#back').trigger('click')
    await waitFor(() => wrapper.vm.$route.path, settingsPath)
    await expectPatch(`${social}/settings`, { terms })
    await controls.openSection('signup')
    expect(controls.input(wrapper.vm.$t('termsOfUse')).element.value).toBe(terms)
    expect(controls.input(wrapper.vm.$t('minOffers')).element.value).toBe('2')
  })

  it('creates, edits and removes a marketplace category with a Material Symbol', async () => {
    await controls.openSection('marketplace')
    const categories = wrapper.getComponent(CategoriesField)
    const row = (name: string) => categories.findAll('tbody tr').find(row => row.text().includes(name))
    expect(categories.findComponent(IconPicker).exists()).toBe(false)
    await controls.button('Add Category', categories).trigger('click')
    await controls.saveCategory(categories, 'Shared tools', 'handyman')
    await waitFor(() => !!row('Shared tools'), true)

    await row('Shared tools')!.findAllComponents(QBtn).find(button => button.props('icon') === 'edit')!.trigger('click')
    await controls.saveCategory(categories, 'Garden tools', 'garden_cart')
    await expectPatch(/\/GRP0\/categories\/[^/]+$/, {
      name: 'Garden tools', icon: { type: 'material', value: 'garden_cart' }
    })
    await waitFor(() => !!row('Garden tools'), true)
    expect(row('Shared tools')).toBeUndefined()
    await controls.confirm(row('Garden tools')!.getComponent(DeleteBtn))
    await waitFor(() => !!row('Garden tools'), false)
  })

  it('saves email frequency and disables the choices when community emails are off', async () => {
    await controls.openSection('emails')
    await controls.button(wrapper.vm.$t('weekly')).trigger('click')
    await expectPatch(`${social}/settings`, { defaultGroupEmailFrequency: 'weekly' })
    await controls.toggle(wrapper.vm.$t('enableGroupEmail')).trigger('click')
    await expectPatch(`${social}/settings`, { enableGroupEmail: false })
    expect(controls.button(wrapper.vm.$t('weekly')).props('disable')).toBe(true)
    await controls.openSection('emails')
    expect(controls.toggle(wrapper.vm.$t('enableGroupEmail')).attributes('aria-checked')).toBe('false')
    expect(controls.button(wrapper.vm.$t('weekly')).attributes('aria-pressed')).toBe('true')
  })

  it('saves external-transfer switches, an explicit rate update and a trustline limit', async () => {
    await controls.openSection('external-transfers')
    await controls.toggle(wrapper.vm.$t('enableExternalPayments')).trigger('click')
    await expectPatch(`${accounting}/currency/settings`, { enableExternalPayments: false })
    const rate = wrapper.findAllComponents(InputUpdate)
      .find(field => field.getComponent(QInput).props('label') === wrapper.vm.$t('currencyValue'))!
    await rate.get('input').setValue('3/2')
    await rate.get('button').trigger('click')
    await expectPatch(`${accounting}/currency`, { rate: { n: 3, d: 2 } })

    await waitFor(() => wrapper.findComponent(TrustlinesField).exists(), true)
    const trustlines = wrapper.getComponent(TrustlinesField)
    await trustlines.findAllComponents(QBtn).find(button => button.props('icon') === 'edit')!.trigger('click')
    const dialog = trustlines.getComponent(QDialog)
    await controls.input(wrapper.vm.$t('limit')).setValue('50')
    await controls.button('Save', dialog).trigger('click')
    await expectPatch(/\/GRP0\/trustlines\/[^/]+$/, { limit: 500000 })
    await waitFor(() => wrapper.getComponent(SaveChanges).text().includes(wrapper.vm.$t('changesSaved')), true)
  })

  it('preserves a pending permission save across the index and account preferences', async () => {
    await controls.openSection('permissions')
    expect(wrapper.text()).not.toContain(wrapper.vm.$t('privacy'))
    const resume = pauseRequests('/GRP0/currency/settings')
    await controls.toggle(wrapper.vm.$t('allowPayments')).trigger('click')
    await waitFor(() => wrapper.getComponent(SaveChanges).text(), wrapper.vm.$t('savingChanges'))
    await wrapper.get('button#back').trigger('click')
    await waitFor(() => wrapper.vm.$route.path, settingsPath)
    await controls.openSection('account-rules')
    expect(wrapper.getComponent(SaveChanges).text()).toBe(wrapper.vm.$t('savingChanges'))
    expect(wrapper.text()).not.toContain(wrapper.vm.$t('transferMethods'))
    resume()
    await expectPatch(`${accounting}/currency/settings`, { defaultAllowPayments: false })

    await controls.toggle(wrapper.vm.$t('enableAcceptPaymentsAfter2w')).trigger('click')
    await expectPatch(`${accounting}/currency/settings`, { defaultAcceptPaymentsAfter: false })
    await controls.toggle(wrapper.vm.$t('hideBalance')).trigger('click')
    await expectPatch(`${accounting}/currency/settings`, { defaultHideBalance: true })
    await controls.openSection('permissions')
    expect(controls.toggle(wrapper.vm.$t('allowPayments')).attributes('aria-checked')).toBe('false')
    await controls.openSection('account-rules')
    expect(controls.toggle(wrapper.vm.$t('hideBalance')).attributes('aria-checked')).toBe('true')
    expect(controls.toggle(wrapper.vm.$t('enableAcceptPaymentsAfter2w')).attributes('aria-checked')).toBe('false')
  })

  it.runIf(import.meta.env.FEAT_TOPUP === 'true')('saves contribution defaults and converts deposit amounts to cents', async () => {
    await controls.openSection('contributions')
    expect(controls.toggle(wrapper.vm.$t('topupEnable')).attributes('aria-disabled')).toBe('true')
    await controls.toggle(wrapper.vm.$t('topupDefaultAllowTopup')).trigger('click')
    await controls.input(wrapper.vm.$t('topupMinAmount')).setValue('2.50')
    await expectPatch(`${accounting}/currency/topup-settings`, {
      enabled: false, defaultAllowTopup: true, rate: { n: 1, d: 100 }, minAmount: 250, maxAmount: 100000
    })
    await controls.openSection('contributions')
    expect(controls.input(wrapper.vm.$t('topupMinAmount')).element.value).toBe('2.5')
    expect(controls.toggle(wrapper.vm.$t('topupDefaultAllowTopup')).attributes('aria-checked')).toBe('true')
  })

  it('disables and enables the community through confirmation dialogs', async () => {
    await controls.openSection('status')
    const status = wrapper.getComponent(GroupStatusField)
    for (const [action, message] of [
      ['disableGroup', 'groupStatusDisabledText'],
      ['enableGroup', 'groupStatusActiveText']
    ]) {
      const control = status.findAllComponents(ConfirmBtn).find(button => button.props('label') === wrapper.vm.$t(action))!
      await controls.confirm(control)
      await waitFor(() => status.text().includes(wrapper.vm.$t(message)), true)
    }
  })

  it('shows signup beside the desktop index and retains saved values while switching sections', async () => {
    const width = window.innerWidth
    try {
      window.innerWidth = 1440
      window.dispatchEvent(new Event('resize'))
      await wrapper.vm.$router.push(settingsPath)
      await waitFor(() => wrapper.element.querySelector('h1')?.textContent, 'Signup')
      const index = wrapper.getComponent(CommunitySettingsNav)
      expect(index.get('a[href$="/signup"]').classes()).toContain('bg-active')
      expect(controls.input(wrapper.vm.$t('minOffers')).element.value).toBe('2')
      await index.get('a[href$="/emails"]').trigger('click')
      await waitFor(() => wrapper.element.querySelector('h1')?.textContent, 'Emails')
      expect(index.get('a[href$="/emails"]').classes()).toContain('bg-active')
      expect(index.get('a[href$="/signup"]').classes()).not.toContain('bg-active')
      expect(controls.toggle(wrapper.vm.$t('enableGroupEmail')).attributes('aria-checked')).toBe('false')
    } finally {
      window.innerWidth = width
      window.dispatchEvent(new Event('resize'))
    }
  })
})
