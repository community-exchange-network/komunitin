import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import path from 'path';

// Initialize i18next
const initI18n = async () => {
  if (!i18next.isInitialized) {
    await i18next
      .use(Backend)
      .init({
        lng: 'ca', // Default fallback
        fallbackLng: 'ca',
        preload: ['ca'], // Preload languages
        ns: ['translation'],
        defaultNS: 'translation',
        backend: {
          loadPath: path.join(__dirname, '../locales/{{lng}}.json'),
        },
        interpolation: {
          escapeValue: false, // Handlebars scrubs HTML
        }
      });
  }
  return i18next;
};

export default initI18n;
