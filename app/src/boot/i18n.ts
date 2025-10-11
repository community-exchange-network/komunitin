import { boot } from "quasar/wrappers";
import { createI18n } from "vue-i18n";
import DefaultMessages from "src/i18n/en-us/index.json";
import type {LangName} from "src/i18n";
import langs, { DEFAULT_LANG, normalizeLocale} from "src/i18n";
import type { QSingletonGlobals, QVueGlobals } from "quasar";
import { useQuasar, Quasar } from "quasar";
import LocalStorage from "../plugins/LocalStorage";
import type { Locale } from "date-fns";
import { formatRelative } from "date-fns";
import { ref, watch } from "vue";
import { useStore } from "vuex";
import store from "src/store";

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
 * Export vue-i18 instance for use outside components.
 */
export const i18n = createI18n({
  locale: DEFAULT_LANG,
  fallbackLocale: DEFAULT_LANG,
  messages: {
    [DEFAULT_LANG as string]: DefaultMessages
  },
  legacy: false
});

/**
 * THe current date locale.
 */
let dateLocale = undefined as Locale | undefined;

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

async function setCurrentLocale($q: QSingletonGlobals|QVueGlobals, locale: string, admin=false) {
  globalLocale = locale
  // Set VueI18n lang.
  const setI18nLocale = async (locale: LangName) => {
    const definition = langs[locale]
    if (i18n.global.locale.value !== locale) {
      const messages = await definition.loadMessages();
      i18n.global.setLocaleMessage(locale, messages);
      i18n.global.locale.value = locale;
    }
    if (admin) {
      const adminMessages = await definition.loadAdminMessages();
      i18n.global.mergeLocaleMessage(locale, adminMessages);
    }
  }

  // Set Quasar lang.
  const setQuasarLang = async (locale: LangName) => {
    const messages = await langs[locale].loadQuasar()
    $q.lang.set(messages);
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

  // Initially set the current locale.ç
  const lang = await getCurrentLocale(Quasar)
  await setCurrentLocale(Quasar, lang, store.getters.isAdmin)

  // Change the current locale to the user defined settings. Note that we do it that way so the
  // store does not depend on the i18n infrastructure and therefore it can be used in the service
  // worker.
  store.watch((_, getters) => {
    return [getters.myUser?.settings?.attributes.language, getters.isAdmin]
  }, ([language, isAdmin]) => {
    if (language && (isAdmin || language !== globalLocale)) {
      setLocale(language, isAdmin)
    }
  })


});

