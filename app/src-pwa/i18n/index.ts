/**
 * We need a separate i18n module for the service worker because dynamic
 * imports are not supported in this environment so we just import the 
 * few required strings from all supported languages.
 */
import en from "./en-us.json"
import es from "./es.json"
import ca from "./ca.json"
import it from "./it.json"

import LocalStorage from "src/plugins/LocalStorage"

/**
 * Returns a function that translates a key to the current language.
 */
export async function translator() {
  // Get language from LocalStorage. That must be set since it is saved in the app boot.
  let lang = await LocalStorage.getItem("lang")
  if (lang === null) {
    console.error("Language not set.")
    lang = "en"
  }
  // Get the translation object for the language.
  const languages = {
    "en": en,
    "es": es,
    "ca": ca,
    "it": it
  }
  // Get the translation object for the language.
  const messages = (lang in languages 
    ? languages[lang as keyof typeof languages] 
    : languages["en"]
  ) as Record<string,string>
  
  return {
    t: (key: string, params?: Record<string,string>) => {
      // Get the translation for the key.
      const translation = messages[key]
      // If there are no params, return the translation.
      if (!params) return translation
      // If there are params, replace them in the translation.
      return Object.entries(params).reduce((acc, [key, value]) => acc.replace(`{${key}}`, value), translation)
    },
    /**
     * Format currency using current locale.
     * @param amount The number to format.
     * @param currency The currency symbol.
     * @param decimals The number of decimal places.
     * @param scale Amount will be divided by 10^scale.
     * @returns 
     */
    c: (amount: number, currency: string, decimals = 2, scale = 0) => {
      const amountString = (amount / (10 ** scale)).toLocaleString(lang, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })
      const sampleCurrency = (1).toLocaleString(lang, {style: 'currency', currency: 'USD'})
      return sampleCurrency.startsWith('1') 
        ? `${amountString}${currency}` 
        : `${currency}${amountString}`
    }
  }
}