import type { Locale } from "date-fns";
import { formatRelative } from "date-fns";
import type { QSingletonGlobals, QVueGlobals } from "quasar";
import { Quasar, useQuasar } from "quasar";
import { boot } from "quasar/wrappers";
import type { LangName } from "src/i18n";
import langs, { DEFAULT_LANG, normalizeLocale } from "src/i18n";
import store from "src/store";
import { ref, watch } from "vue";
import { createI18n } from "vue-i18n";
import { useStore } from "vuex";
import LocalStorage from "../plugins/LocalStorage";

declare module "vue" {
  interface ComponentCustomProperties {
    $formatDate: (date: string) => string;
  }
}

/**
 * LocalStorage key for the saved locale.
 */
const LOCALE_KEY = "lang";

/**
 * Build per-locale fallback map from LocaleDefinition.fallbackLocale fields.
 * For example, { "en-gb": ["en-us"] } means en-gb falls back to en-us.
 * 
 * vue-i18n uses this to resolve missing keys: if en-gb doesn't have a key,
 * it looks in en-us before giving up.
 */
function buildFallbackLocale(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const locale of Object.keys(langs)) {
    const fallbacks: string[] = [];
    let currentLocale = locale as LangName;
    while (langs[currentLocale].fallbackLocale) {
      const fallback = langs[currentLocale].fallbackLocale as LangName;
      if (fallbacks.includes(fallback) || fallback === locale || !langs[fallback]) {
        // Circular fallback or invalid fallback, stop processing.
        break;
      }
      fallbacks.push(fallback);
      currentLocale = fallback;
    }
    map[locale] = fallbacks;
  }

  return map;
}

/**
 * Export vue-i18n instance for use outside components.
 */
export const i18n = createI18n({
  locale: undefined,
  legacy: false,
  fallbackLocale: {
    ...buildFallbackLocale()
  },
});

/**
 * The current date locale.
 */
let dateLocale: Locale | undefined = undefined;

/**
 * Return the date-fns Locale object for other operations than formatDate.
 */
export const getDateLocale = () => dateLocale;

let globalLocale = DEFAULT_LANG

/**
 * Return the user locale based on previous session or browser.
 */
async function getCurrentLocale($q: QSingletonGlobals) {
  // Option 1: Locale saved in LocalStorage from previous session.
  const savedLang = await LocalStorage.getItem(LOCALE_KEY);
  if (savedLang !== null) {
    return savedLang as string;
  }
  // Option 2: Use browser language if supported.
  const quasarLang = $q.lang.getLocale() ?? DEFAULT_LANG;
  return normalizeLocale(quasarLang);
}

/**
 * This function sets the current locale for the app. Use it from outside a .vue file.
 * Otherwise use the useLocale composable. 
 * 
 * Note that this function does not update the user.settings.language attribute.
 */
export async function setLocale(locale: string, admin=false) {
  const lang = normalizeLocale(locale);
  await setCurrentLocale(Quasar, lang, admin)
}

async function loadLocaleMessages(locale: LangName, admin=false) {
  if (i18n.global.availableLocales.includes(locale)) {
    return;
  }
  const definition = langs[locale]

  // Recursively load fallback locale messages.
  if (definition.fallbackLocale) {
    await loadLocaleMessages(definition.fallbackLocale as LangName, admin)
  }
  // Load this locale's messages.
  if (definition.loadMessages !== undefined) {
    const messages = await definition.loadMessages();
    i18n.global.setLocaleMessage(locale, messages);
  }
  
  // Load feature messages.
  if (definition.features) {
    for (const featureName in definition.features) {
      const featureMessages = await definition.features[featureName]();
      i18n.global.mergeLocaleMessage(locale, featureMessages);
    }
  }
  // Load admin messages.
  if (admin && definition.loadAdminMessages !== undefined) {
    const adminMessages = await definition.loadAdminMessages();
    i18n.global.mergeLocaleMessage(locale, adminMessages);
  }
}

async function setCurrentLocale($q: QSingletonGlobals|QVueGlobals, locale: string, admin=false) {
  globalLocale = locale
  // Set VueI18n lang.
  const setI18nLocale = async (locale: LangName) => {
    if (i18n.global.locale.value !== locale) {
      await loadLocaleMessages(locale, admin)
      i18n.global.locale.value = locale;
    }
  }

  // Set Quasar lang.
  const setQuasarLang = async (locale: LangName) => {
    const quasarLanguage = await langs[locale].loadQuasar()
    $q.lang.set(quasarLanguage);
  }

  // Set date-fns lang.
  const setDateLocale = async (locale: LangName) => {
    dateLocale = await langs[locale].loadDateFNS()
  }

  const lang = normalizeLocale(locale);
  
  await Promise.all([
    setI18nLocale(lang),
    setQuasarLang(lang),
    setDateLocale(lang),
    LocalStorage.set(LOCALE_KEY, locale)
  ]);
}

/**
 * Use this composable to implement language chooser components.
 */
export function useLocale() {
  const locale = ref(globalLocale)
  const $q = useQuasar()   
  const store = useStore()
  watch(locale, async (locale) => {
    await setCurrentLocale($q, locale, store.getters.isAdmin)
  })
  return locale;
}


// Default export for Quasar boot files.
export default boot(async ({ app }) => {
  // Install 'vue-i18n' plugin.
  app.use(i18n);

  // Add date filter to Vue.
  app.config.globalProperties.$formatDate = (date: string) =>
    formatRelative(new Date(date), new Date(), { locale: dateLocale })

  // Initially set the current locale.
  const lang = await getCurrentLocale(Quasar)
  const isAdmin = store.getters.isAdmin || store.getters.isSuperadmin
  await setCurrentLocale(Quasar, lang, isAdmin)

  // Change the current locale to the user defined settings. Note that we do it that way so the
  // store does not depend on the i18n infrastructure and therefore it can be used in the service
  // worker.
  store.watch((_, getters) => {
    return [getters.myUser?.settings?.attributes.language, getters.isAdmin || getters.isSuperadmin]
  }, ([language, isAdmin]) => {
    if (language && (isAdmin || language !== globalLocale)) {
      setLocale(language, isAdmin)
    }
  })


});

