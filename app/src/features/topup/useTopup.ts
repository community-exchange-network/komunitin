import { useStore } from "vuex"
import { config } from "../../utils/config"
import { useApiFetch } from "../../composables/useApiFetch"
import { computed, type MaybeRef, toValue, ref, watchEffect } from "vue"
import { type AccountWithSettingsAndCurrencySettings } from "../../composables/accountSettings"
import KError, { KErrorCode } from "../../KError"
import { useResource } from "../../composables/useResources"
import { type Currency, type Account} from "../../store/model"
import { type Topup, type AccountTopupSettings, type TopupSettings } from "./model"
import { useI18n } from "vue-i18n"
import { type DeepPartial } from "quasar"

type CombinedTopupSettings = Omit<TopupSettings["attributes"], "defaultAllowTopup"> & AccountTopupSettings["attributes"]

export const useTopupSettings = (account?: MaybeRef<Account & {currency: Currency}>) => {
  const store = useStore()
  const accountVal = toValue(account) ?? store.getters.myAccount
  const currencyCode = accountVal.currency.attributes.code
  
  const {resource: topupSettings} = useResource<TopupSettings>('topup-settings', {
    group: currencyCode,
    id: accountVal.currency.id
  })
  const {resource: accountTopupSettings} = useResource<AccountTopupSettings>('account-topup-settings', {
    group: currencyCode,
    id: accountVal.id
  })

  return computed<CombinedTopupSettings|null>(() => {
    const topupSettingsVal = toValue(topupSettings)
    const accountTopupSettingsVal = toValue(accountTopupSettings)
    if (!topupSettingsVal || !accountTopupSettingsVal) {
      return null
    }
    const { defaultAllowTopup, ...settings } = topupSettingsVal.attributes
    const { allowTopup, ...accountSettings } = accountTopupSettingsVal.attributes
    return {
      ...settings,
      ...accountSettings,
      allowTopup: allowTopup ?? defaultAllowTopup ?? false,
    }
  })
}

export const useCreateTopup = (options: { account: MaybeRef<AccountWithSettingsAndCurrencySettings>, amountToDeposit: MaybeRef<number> }) => {
  
  const settings = useTopupSettings(options.account)
  const currency = computed(() => toValue(options.account).currency)

  const apiFetch = useApiFetch()
  const { t } = useI18n()

  // Error state
  const isLoading = ref(false)

  // Check if topup is available
  const isAvailable = computed(() => settings.value.allowTopup === true)

  const amountToReceive = computed(() => {
    if (!isAvailable.value) {
      return 0
    }
    const rate = settings.value.rate
    const received = toValue(options.amountToDeposit) * rate.n / rate.d
    return received
  })

  const topup = ref<DeepPartial<Topup>>()

  watchEffect(() => {
    const account = toValue(options.account)
    topup.value = {      
      type: 'topups',
      attributes: {
        depositAmount: toValue(options.amountToDeposit),
        depositCurrency: settings.value.depositCurrency as "EUR",
        receiveAmount: amountToReceive.value,
        status: 'new',
        meta: {
          description: t('topupDescription', { account: account.attributes.code })
        }
      } as Topup["attributes"],
      relationships: {
        account: {
          data: {
            type: 'accounts',
            id: account.id,
          }
        } as Topup["relationships"]["account"],
      },
    }
  })

  const create = async () => {
    if (!isAvailable.value) {
      throw new KError(KErrorCode.Forbidden, 'Topup not available')
    }
    isLoading.value = true
    
    try {
      
      const baseUrl = config.ACCOUNTING_URL
      const code = currency.value.attributes.code
      
      
      // create the topup resource
      const result = await apiFetch(`${baseUrl}/${code}/topups`, {
        method: 'POST',
        body: {
          data: topup.value
        }
      })
      
      topup.value = result.data as Topup
      return topup.value
    } finally {
      isLoading.value = false
    }
  }

  const updateStatus = async (status: 'pending' | 'canceled') => {
    if (!topup.value) {
      throw new KError(KErrorCode.ScriptError, 'No topup to update')
    }
    isLoading.value = true
    try {
      const baseUrl = config.ACCOUNTING_URL
      const code = currency.value.attributes.code

      const result = await apiFetch(`${baseUrl}/${code}/topups/${topup.value.id}`, {
        method: 'PATCH',
        body: {
          data: {
            type: 'topups',
            id: topup.value.id,
            attributes: {
              status,
            }
          }
        }
      })
      topup.value = result.data as Topup
      return topup.value
    } finally {
      isLoading.value = false
    }
  }

  const start = () => updateStatus("pending")
  const cancel = () => updateStatus("canceled")

  return {
    amountToReceive,
    isLoading,
    isAvailable,
    create,
    start,
    cancel,
    topup
  }

}

export const useTopup = (group: string, id: string) => {
  return useResource<Topup & { account: Account & { currency: Currency } }>('topups', {
    group,
    id,
    include: 'account,account.currency'
  }, { 
    immediate: true,
  })
}
