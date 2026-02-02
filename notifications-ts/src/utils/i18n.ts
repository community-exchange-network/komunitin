import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize i18next
const initI18n = async () => {
  if (!i18next.isInitialized) {
    await i18next
      .use(Backend)
      .init({
        lng: 'en', // Default fallback
        fallbackLng: 'en',
        preload: ['ca', 'en', 'es', 'it'], // Preload languages
        ns: ['translation'],
        defaultNS: 'translation',
        backend: {
          loadPath: path.join(__dirname, '../i18n/{{lng}}.json'),
        },
        interpolation: {
          escapeValue: false, // Handlebars scrubs HTML
        }
      });
      // Use Intl.DurationFormat for duration formatting (from node 23+)
      i18next.services.formatter?.add('duration', (value: Intl.Duration) => {
        return Intl.DurationFormat(i18next.language, {
          style: 'short',
        }).format(value);
      });
  }
  return i18next;
};

export const tzDate = (timezone: string, date: Date = new Date()): Date => {
  const localTimeStr = date.toLocaleString('en-US', { timeZone: timezone, hour12: false });
  return new Date(localTimeStr);
}

export default initI18n;
