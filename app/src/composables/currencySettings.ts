import { computed, MaybeRefOrGetter, toValue } from "vue";
import { useStore } from "vuex";
import { CurrencySettings } from "../store/model";

/**
 * Return the currency settings for a given currency code, or the current account's 
 * currency settings if no code is provided. This composable does not fetch the settings
 * from the server, it only returns them from the store.
 * 
 * @param code 
 * @returns 
 */
export const useCurrencySettings = (code?: MaybeRefOrGetter<string|undefined>) => {
  const store = useStore();
  return computed<CurrencySettings | undefined>(() => {
    const currencyCode = code ? toValue(code) : undefined
    const currency = code
      ? store.getters["currencies/find"]({ code: currencyCode })
      : store.getters.myAccount?.currency
    
    if (currency) {
      return currency.settings
    }

    return undefined
  })
    
}