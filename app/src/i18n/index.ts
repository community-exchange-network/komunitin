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
  /** Per-locale fallback chain for vue-i18n message resolution (e.g., en-gb → en-us). */
  fallbackLocale?: string,
  loadMessages: () => Promise<never>,
  loadAdminMessages: () => Promise<never>,
  loadQuasar: () => Promise<QuasarLanguage>,
  loadDateFNS: () => Promise<Locale>,
  loadCountries: () => Promise<never>
  features?: Record<string, () => Promise<never>>
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
  "en-gb": {
    label: "English (UK)",
    fallbackLocale: "en-us",
    loadMessages: async () => (await import("src/i18n/en-gb/index.json")).default,
    loadAdminMessages: async () => (await import("src/i18n/en-gb/admin.json")).default,
    loadQuasar: async () => (await import("quasar/lang/en-GB")).default,
    loadDateFNS: async () => (await import("date-fns/locale/en-GB")).enGB,
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
  "fr": {
    label: "Français",
    loadMessages: async () => (await import("src/i18n/fr/index.json")).default,
    loadAdminMessages: async () => (await import("src/i18n/fr/admin.json")).default,
    loadQuasar: async () => (await import("quasar/lang/fr")).default,
    loadDateFNS: async () => (await import("date-fns/locale/fr")).fr,
    loadCountries: async () => (await import("i18n-iso-countries/langs/fr.json")).default
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

if (process.env.FEAT_TOPUP === 'true') {
  langs["en-us"].features = {
    topup: async () => (await import("src/i18n/en-us/topup.json")).default as never
  }
  langs["ca"].features = {
    topup: async () => (await import("src/i18n/ca/topup.json")).default as never
  }
  langs["es"].features = {
    topup: async () => (await import("src/i18n/es/topup.json")).default as never
  }
  langs["fr"].features = {
    topup: async () => (await import("src/i18n/fr/topup.json")).default as never
  }
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
 * 
 * Handles sub-locales by matching the base language first, then
 * mapping unmatched sub-locales to the closest defined locale
 * (e.g., en-IE -> en-gb, fr-CA -> fr).
 * **/
export function normalizeLocale(locale: string): LangName {
  const lower = locale.toLowerCase();
  // Exact match (e.g., "en-us", "en-gb", "es", "ca")
  if (lower in langs) return lower as LangName;
  // Try base language (e.g., "es" from "es-ar", "fr" from "fr-ca")
  const base = lower.split('-')[0];
  if (base in langs) return base as LangName;
  // For sub-locales (with region code), find the best matching locale.
  if (lower.includes('-')) {
    // For English specifically, non-US sub-locales (en-ie, en-au, etc.) map to en-gb.
    if (base === 'en' && 'en-gb' in langs) return 'en-gb' as LangName;
    // For other languages, find any locale starting with the base language.
    const match = (Object.keys(langs) as LangName[]).find(k => k.split('-')[0] === base);
    if (match) return match;
  }
  return DEFAULT_LANG;
}

export function getLocaleDefinition(locale: string): LocaleDefinition {
  return langs[normalizeLocale(locale)];
}



