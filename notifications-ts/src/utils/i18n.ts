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
  }
  return i18next;
};

export default initI18n;
