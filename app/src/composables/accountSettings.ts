
import type { MaybeRefOrGetter} from "@vueuse/shared";
import { toValue } from "@vueuse/shared"
import type { Account, AccountSettings, Currency, CurrencySettings } from "@/store/model"
import { computed, ref } from "vue"
import { useStore } from "vuex"


export const currencySettingsToAccountSettingsAttributes = (attributes: Partial<CurrencySettings['attributes']>) => {
  return {
    allowPayments: attributes.defaultAllowPayments ?? false,
    allowPaymentRequests: attributes.defaultAllowPaymentRequests ?? false,
    acceptPaymentsAutomatically: attributes.defaultAcceptPaymentsAutomatically ?? false,
    allowSimplePayments: attributes.defaultAllowSimplePayments ?? false,
    allowSimplePaymentRequests: attributes.defaultAllowSimplePaymentRequests ?? false,
    allowQrPayments: attributes.defaultAllowQrPayments ?? false,
    allowQrPaymentRequests: attributes.defaultAllowQrPaymentRequests ?? false,
    allowTagPayments: attributes.defaultAllowTagPayments ?? false,
    allowTagPaymentRequests: attributes.defaultAllowTagPaymentRequests ?? false,
    allowMultiplePayments: attributes.defaultAllowMultiplePayments ?? false,
    allowMultiplePaymentRequests: attributes.defaultAllowMultiplePaymentRequests ?? false,
    acceptPaymentsAfter: attributes.defaultAcceptPaymentsAfter ?? false,
    onPaymentCreditLimit: attributes.defaultOnPaymentCreditLimit ?? false,
    allowExternalPayments: attributes.defaultAllowExternalPayments ?? false,
    allowExternalPaymentRequests: attributes.defaultAllowExternalPaymentRequests ?? false,
    acceptExternalPaymentsAutomatically: attributes.defaultAcceptExternalPaymentsAutomatically ?? false,
    hideBalance: attributes.defaultHideBalance ?? false,
  } as AccountSettings["attributes"]
}

export const accountSettingsToCurrencySettingsAttributes = (attributes: Partial<AccountSettings['attributes']>) => {
  // Build the attributes for the currency-settings object. The keys are the same
  // as the account settings object but with the "default" prefix.
  const accountDefaults = {} as Record<string, unknown>
  for (const key of Object.keys(attributes)) {
    const defaultKey = "default" + key[0].toUpperCase() + key.slice(1) as keyof CurrencySettings["attributes"]
    accountDefaults[defaultKey] = attributes[key as keyof AccountSettings["attributes"]]
  }
  return accountDefaults as Partial<CurrencySettings["attributes"]>
}

/** Edit currency defaults through account fields, saving only changed attributes. */
export const useAccountDefaultSettings = (
  currencySettings: CurrencySettings,
  saveCurrencySettings: (attributes: Partial<CurrencySettings['attributes']>) => Promise<void>
) => {
  const accountSettings = ref(currencySettingsToAccountSettingsAttributes(currencySettings.attributes))
  const updateSettings = (attributes: Partial<AccountSettings['attributes']>) => {
    Object.assign(accountSettings.value, attributes)
    return saveCurrencySettings(accountSettingsToCurrencySettingsAttributes(attributes))
  }
  return { accountSettings, updateSettings }
}

export const effectiveSettings = (accountSettings: AccountSettings, currencySettings: CurrencySettings) => {
  const defaults = currencySettingsToAccountSettingsAttributes(currencySettings.attributes)
  const vals = accountSettings.attributes
  const attributes = {} as Record<string, unknown>
  
  Object.entries(defaults).forEach(([key, value]) => {
    attributes[key] = vals[key as keyof AccountSettings["attributes"]] ?? value
  })

  return attributes as AccountSettings["attributes"]
}

export const useEffectiveSettings = (accountSettings: MaybeRefOrGetter<AccountSettings|undefined>, currencySettings: MaybeRefOrGetter<CurrencySettings|undefined>) => {
  return computed(() => {
    const account = toValue(accountSettings)
    const currency = toValue(currencySettings)
    if (account && currency) {
      return effectiveSettings(account, currency)
    } else {
      return undefined
    }
  })  
}
export type AccountWithSettingsAndCurrencySettings = Account & { settings: AccountSettings, currency: Currency & {settings: CurrencySettings}}
export const useAccountSettings = (account: MaybeRefOrGetter<AccountWithSettingsAndCurrencySettings | undefined>) => {
  const accountSettings = computed(() => toValue(account)?.settings)
  const currencySettings = computed(() => toValue(account)?.currency?.settings)
  return useEffectiveSettings(accountSettings, currencySettings)
}

export const useMyAccountSettings = () => {
  const store = useStore()
  return useAccountSettings(() => store.getters.myAccount)
}
