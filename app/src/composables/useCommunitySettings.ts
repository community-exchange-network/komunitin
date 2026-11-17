import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { DeepPartial } from 'quasar'
import { useResource } from './useResources'
import type { Currency, CurrencySettings, Group, GroupSettings } from '@/store/model'

/** Shared resources and saves for one mounted community settings shell. */
export const useCommunitySettingsContext = (
  groupCode: MaybeRefOrGetter<string>,
  save: (action: () => Promise<void>) => Promise<void>
) => {
  const code = computed(() => toValue(groupCode))
  const options = computed(() => ({ group: code.value, include: 'settings' }))
  const { resource: group, loaded: groupLoaded } = useResource<Group & { settings: GroupSettings }>('groups', options)
  const { resource: currency, loaded: currencyLoaded, update: updateCurrency, loading: updatingCurrency } =
    useResource<Currency & { settings: CurrencySettings }>('currencies', options)
  const groupSettings = computed(() => group.value?.settings)
  const currencySettings = computed(() => currency.value?.settings)
  const loaded = computed(() => groupLoaded.value && currencyLoaded.value && !!groupSettings.value && !!currencySettings.value)

  // Settings are already included in the parent resources.
  const settingsOptions = () => ({ group: code.value })
  const { update: updateGroupSettings } = useResource<GroupSettings>('group-settings', settingsOptions, { immediate: false, watch: false })
  const { update: updateCurrencySettings, loading: updatingCurrencySettings } =
    useResource<CurrencySettings>('currency-settings', settingsOptions, { immediate: false, watch: false })

  // Sections supply attribute patches; resource identity and save feedback are shared.
  const saveGroupSettings = (attributes: Partial<GroupSettings['attributes']>) => save(() => updateGroupSettings({
    id: groupSettings.value.id,
    type: 'group-settings',
    attributes
  }))
  const saveCurrency = (attributes: DeepPartial<Currency['attributes']>) => save(() => updateCurrency({
    id: currency.value.id,
    type: 'currencies',
    attributes
  }))
  const saveCurrencySettings = (attributes: Partial<CurrencySettings['attributes']>) => save(() => updateCurrencySettings({
    id: currencySettings.value.id,
    type: 'currency-settings',
    attributes
  }))

  return {
    code, group, currency, groupSettings, currencySettings, loaded,
    updatingCurrency, updatingCurrencySettings,
    save, saveGroupSettings, saveCurrency, saveCurrencySettings
  }
}

export type CommunitySettingsContext = ReturnType<typeof useCommunitySettingsContext>
