/**
 * List of defined languages for the app and their full native name.
 * 
 * Here we don't import the full list of all lang messages, since this may grow a lot 
 * and we anynchronously load them in i18n boot file.
 */

import type { Locale } from "date-fns"
import type { QuasarLanguage } from "quasar"

export interface LocaleDefinition {
  label: string,
  loadMessages: () => Promise<never>,
  loadAdminMessages: () => Promise<never>,
  loadQuasar: () => Promise<QuasarLanguage>,
  loadDateFNS: () => Promise<Locale>,
  loadCountries: () => Promise<never>
}

const langs = {
  "ca": {
    label: "Català",
    loadMessages: async () => (await import("src/i18n/ca/index.json")).default,
    loadAdminMessages: async () => (await import("src/i18n/ca/admin.json")).default,
    loadQuasar: async () => (await import("quasar/lang/ca")).default,
    loadDateFNS: async () => (await import("date-fns/locale/ca")).ca,
    loadCountries: async () => (await import("i18n-iso-countries/langs/ca.json")).default
  } as LocaleDefinition,
  "en-us": {
    label: "English",
    loadMessages: async () => (await import("src/i18n/en-us/index.json")).default,
    loadAdminMessages: async () => (await import("src/i18n/en-us/admin.json")).default,
    loadQuasar: async () => (await import("quasar/lang/en-US")).default,
    loadDateFNS: async () => (await import("date-fns/locale/en-US")).enUS,
    loadCountries: async () => (await import("i18n-iso-countries/langs/en.json")).default
  } as LocaleDefinition,
  "es": {
    label: "Español",
    loadMessages: async () => (await import("src/i18n/es/index.json")).default,
    loadAdminMessages: async () => (await import("src/i18n/es/admin.json")).default,
    loadQuasar: async () => (await import("quasar/lang/es")).default,
    loadDateFNS: async () => (await import("date-fns/locale/es")).es,
    loadCountries: async () => (await import("i18n-iso-countries/langs/es.json")).default
  } as LocaleDefinition,
  "it": {
    label: "Italiano",
    loadMessages: async () => (await import("src/i18n/it/index.json")).default,
    loadAdminMessages: async () => (await import("src/i18n/it/admin.json")).default,
    loadQuasar: async () => (await import("quasar/lang/it")).default,
    loadDateFNS: async () => (await import("date-fns/locale/it")).it,
    loadCountries: async () => (await import("i18n-iso-countries/langs/it.json")).default
  } as LocaleDefinition,
}

export type LangName = keyof typeof langs
export default langs as Record<LangName, LocaleDefinition>
/**
 * Default to english language.
 */
export const DEFAULT_LANG = "en-us";
/**
 * Return locale if it is a defined language for this app,
 * or the default language code (English) instead.
 * **/
export function normalizeLocale(locale: string): LangName {
  return (locale in langs) ? locale as LangName : DEFAULT_LANG;
}

export function getLocaleDefinition(locale: string): LocaleDefinition {
  return langs[normalizeLocale(locale)];
}



