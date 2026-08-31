import type { Locale } from "date-fns";
import { formatRelative } from "date-fns";
import type { QSingletonGlobals } from "quasar";
import { Quasar } from "quasar";
import { boot } from "quasar/wrappers";
import type { LangName } from "src/i18n";
import langs, { DEFAULT_LANG, normalizeLocale } from "src/i18n";
import store, { storeReady } from "src/store";
import { computed, ref } from "vue";
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
    if (fallbacks.length > 0) {
      map[locale] = fallbacks;
    }
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
    // We don't set a global english fallback because we're not loading english messages by default.
    // Languages that want to fallback to english should set it explicitly in their LocaleDefinition.fallbackLocale field.
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

const globalLocale = ref(DEFAULT_LANG)
let localeUpdate = Promise.resolve()

const loadedAdminLocales = new Set<string>();

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
 * Note that this function does not update the user language attribute.
 */
export function setLocale(locale: string, admin=false) {
  const lang = normalizeLocale(locale);
  globalLocale.value = lang
  // Queue locale changes so asynchronous loads finish in request order.
  localeUpdate = localeUpdate
    .catch(() => undefined)
    .then(() => setCurrentLocale(Quasar, lang, admin))
  return localeUpdate
}

async function loadLocaleMessages(locale: LangName, admin=false) {
  const definition = langs[locale]

  // Recursively load fallback locale messages.
  if (definition.fallbackLocale) {
    await loadLocaleMessages(definition.fallbackLocale as LangName, admin)
  }

  if (!i18n.global.availableLocales.includes(locale)) {
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
  }

  // Load admin messages.
  if (admin && !loadedAdminLocales.has(locale) && definition.loadAdminMessages !== undefined) {
    const adminMessages = await definition.loadAdminMessages();
    i18n.global.mergeLocaleMessage(locale, adminMessages);
    loadedAdminLocales.add(locale);
  }
}

async function setCurrentLocale($q: QSingletonGlobals, locale: LangName, admin=false) {
  const [, quasarLanguage, loadedDateLocale] = await Promise.all([
    loadLocaleMessages(locale, admin),
    langs[locale].loadQuasar(),
    langs[locale].loadDateFNS(),
    LocalStorage.set(LOCALE_KEY, locale)
  ])

  i18n.global.locale.value = locale
  $q.lang.set(quasarLanguage)
  dateLocale = loadedDateLocale
}

/**
 * Use this composable to implement language chooser components.
 */
export function useLocale() {
  const store = useStore()
  return computed({
    get: () => globalLocale.value,
    set: locale => {
      setLocale(locale, getUserLocaleState(store.getters).admin)
    }
  })
}

function getUserLocaleState(getters: typeof store.getters, fallback = globalLocale.value) {
  const user = getters.myUser
  const lang = (user?.attributes.language ?? fallback) as string
  const admin = Boolean(getters.isAdmin || getters.isSuperadmin)
  return { user, lang, admin }
}

// Default export for Quasar boot files.
export default boot(async ({ app }) => {
  // Install 'vue-i18n' plugin.
  app.use(i18n);

  // Add date filter to Vue.
  app.config.globalProperties.$formatDate = (date: string) =>
    formatRelative(new Date(date), new Date(), { locale: dateLocale })

  // storeReady resolves after persisted Vuex state has been restored.
  const [lang] = await Promise.all([
    getCurrentLocale(Quasar),
    storeReady
  ])
  const initialLocale = getUserLocaleState(store.getters, lang)
  await setLocale(initialLocale.lang, initialLocale.admin)

  store.watch((_, getters) => {
    const { user, lang, admin } = getUserLocaleState(getters)
    return user ? `${lang}:${admin}` : undefined
  }, () => {
    const { user, lang, admin } = getUserLocaleState(store.getters)
    // wait for user load before applying language settings.
    if (user) {
      setLocale(lang, admin)
    }
  })
});
