import i18next, { type i18n } from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import { fileURLToPath } from 'url';

// List of supported languages. Must match the available translation files in src/i18n
const LANGUAGES = ['ca', 'en', 'es', 'fr', 'it'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Singleton promise to ensure i18n is initialized only once
let initI18nPromise: Promise<i18n> | null = null;

// Initialize i18next
const initI18n = async () => {
  if (initI18nPromise === null) {
    initI18nPromise = i18next.use(Backend)
      .init({
        lng: 'en', // Default fallback
        fallbackLng: 'en',
        preload: LANGUAGES, // Preload languages
        ns: ['translation'],
        defaultNS: 'translation',
        backend: {
          loadPath: path.join(__dirname, '../i18n/{{lng}}.json'),
        },
        interpolation: {
          escapeValue: false, // Handlebars scrubs HTML
        },
      }).then(() => {
        // Use Intl.DurationFormat for duration formatting (from node 23+)
        i18next.services.formatter?.add('duration', (value: Intl.Duration, lng?: string) => {
          const locale = lng ?? i18next.language;
          return new Intl.DurationFormat(locale, {
            style: 'short',
          }).format(value);
        });
        return i18next;
      });
  }
  return await initI18nPromise;
};

export const tzDate = (timezone: string, date: Date = new Date()): Date => {
  const localTimeStr = date.toLocaleString('en-US', { timeZone: timezone, hour12: false });
  return new Date(localTimeStr);
}

export default initI18n;
