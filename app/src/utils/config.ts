/**
 * Runtime configuration utility with two-tier system:
 * 
 * 1. RUNTIME CONFIG (Production/Docker):
 *    - Values injected by Docker container startup script (replace_env_vars.sh)
 *    - Stored in window.__KOMUNITIN_APP_CONFIG__ object via config.js
 *    - Allows changing configuration without rebuilding the app
 * 
 * 2. BUILD-TIME CONFIG (Development/Fallback):
 *    - import.meta.env.* values replaced by Quasar at build time
 *    - Uses values from .env files and quasar.config.ts build.defineEnv
 *    - Strings from the build environment; missing values use empty/false defaults
 * 
 * Usage: Simply import and use config.PROPERTY_NAME anywhere in the app.
 */

declare global {
  interface Window {
    __KOMUNITIN_APP_CONFIG__?: Record<string, string>;
  }
}

function getValue(key: string, buildTimeValue: string | boolean | undefined): string | boolean | undefined {
  if (typeof window !== 'undefined' && window.__KOMUNITIN_APP_CONFIG__?.[key]) {
    // 1. Try runtime config (Docker injected)
    return window.__KOMUNITIN_APP_CONFIG__[key];
  } else {
    // 2. Use build-time config (Quasar replaced import.meta.env)
    return buildTimeValue;
  }
}

function getBoolean(key: string, buildTimeValue: string | boolean | undefined): boolean {
  const value = getValue(key, buildTimeValue);
  return typeof value === 'string' ? value === 'true' : Boolean(value);
}

function getString(key: string, buildTimeValue: string | boolean | undefined): string {
  const value = getValue(key, buildTimeValue);
  return value !== undefined ? String(value) : ""
}

export const config = {
  OAUTH_CLIENTID: getString('OAUTH_CLIENTID', import.meta.env.OAUTH_CLIENTID),
  MOCK_ENABLE: getBoolean('MOCK_ENABLE', import.meta.env.MOCK_ENABLE),
  MOCK_ENVIRONMENT: getString('MOCK_ENVIRONMENT', import.meta.env.MOCK_ENVIRONMENT),
  MOCK_AUTH: getBoolean('MOCK_AUTH', import.meta.env.MOCK_AUTH),
  MOCK_ACCOUNTING: getBoolean('MOCK_ACCOUNTING', import.meta.env.MOCK_ACCOUNTING),
  MOCK_SOCIAL: getBoolean('MOCK_SOCIAL', import.meta.env.MOCK_SOCIAL),
  MOCK_NOTIFICATIONS: getBoolean('MOCK_NOTIFICATIONS', import.meta.env.MOCK_NOTIFICATIONS),
  AUTH_URL: getString('AUTH_URL', import.meta.env.AUTH_URL),
  ACCOUNTING_URL: getString('ACCOUNTING_URL', import.meta.env.ACCOUNTING_URL),
  SOCIAL_URL: getString('SOCIAL_URL', import.meta.env.SOCIAL_URL),
  FILES_URL: getString('FILES_URL', import.meta.env.FILES_URL),
  NOTIFICATIONS_URL: getString('NOTIFICATIONS_URL', import.meta.env.NOTIFICATIONS_URL),
  PUSH_NOTIFICATIONS_VAPID_PUBLIC_KEY: getString('PUSH_NOTIFICATIONS_VAPID_PUBLIC_KEY', import.meta.env.PUSH_NOTIFICATIONS_VAPID_PUBLIC_KEY),
  GTAG_ID: getString('GTAG_ID', import.meta.env.GTAG_ID),
  MATOMO_URL: getString('MATOMO_URL', import.meta.env.MATOMO_URL),
  MATOMO_SITE_ID: getString('MATOMO_SITE_ID', import.meta.env.MATOMO_SITE_ID),
  FEEDBACK_URL: getString('FEEDBACK_URL', import.meta.env.FEEDBACK_URL),
  DOCS_URL: getString('DOCS_URL', import.meta.env.DOCS_URL),
  PRIVACY_URL: getString('PRIVACY_URL', import.meta.env.PRIVACY_URL),
  TERMS_URL: getString('TERMS_URL', import.meta.env.TERMS_URL),
  COOKIES_URL: getString('COOKIES_URL', import.meta.env.COOKIES_URL)
};

export function setConfig(newConfig: Record<string, string>) {
  Object.assign(config, newConfig);
}
