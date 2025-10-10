/**
 * Runtime configuration utility with two-tier system:
 * 
 * 1. RUNTIME CONFIG (Production/Docker):
 *    - Values injected by Docker container startup script (replace_env_vars.sh)
 *    - Stored in window.__KOMUNITIN_APP_CONFIG__ object via config.js
 *    - Allows changing configuration without rebuilding the app
 * 
 * 2. BUILD-TIME CONFIG (Development/Fallback):
 *    - process.env.* values replaced by Quasar at build time
 *    - Uses values from .env files and quasar.config.ts build.env
 *    - Defined at build time, properly typed (string/boolean)
 * 
 * Usage: Simply import and use config.PROPERTY_NAME anywhere in the app.
 * All values are guaranteed to be available since they're defined in quasar.config.ts.
 */

declare global {
  interface Window {
    __KOMUNITIN_APP_CONFIG__?: Record<string, string>;
  }
}

function getValue(key: string, buildTimeValue: string | boolean): string | boolean {
  if (typeof window !== 'undefined' && window.__KOMUNITIN_APP_CONFIG__?.[key]) {
    // 1. Try runtime config (Docker injected)
    return window.__KOMUNITIN_APP_CONFIG__[key];
  } else {
    // 2. Use build-time config (Quasar replaced process.env)
    return buildTimeValue;
  }
}

function getBoolean(key: string, buildTimeValue: string | boolean): boolean {
  const value = getValue(key, buildTimeValue);
  return typeof value === 'string' ? value === 'true' : Boolean(value);
}

function getString(key: string, buildTimeValue: string | boolean): string {
  const value = getValue(key, buildTimeValue);
  return value !== undefined ? String(value) : ""
}

export const config = {
  OAUTH_CLIENTID: getString('OAUTH_CLIENTID', process.env.OAUTH_CLIENTID),
  MOCK_ENABLE: getBoolean('MOCK_ENABLE', process.env.MOCK_ENABLE),
  MOCK_ENVIRONMENT: getString('MOCK_ENVIRONMENT', process.env.MOCK_ENVIRONMENT),
  MOCK_AUTH: getBoolean('MOCK_AUTH', process.env.MOCK_AUTH),
  MOCK_ACCOUNTING: getBoolean('MOCK_ACCOUNTING', process.env.MOCK_ACCOUNTING),
  MOCK_SOCIAL: getBoolean('MOCK_SOCIAL', process.env.MOCK_SOCIAL),
  MOCK_NOTIFICATIONS: getBoolean('MOCK_NOTIFICATIONS', process.env.MOCK_NOTIFICATIONS),
  AUTH_URL: getString('AUTH_URL', process.env.AUTH_URL),
  ACCOUNTING_URL: getString('ACCOUNTING_URL', process.env.ACCOUNTING_URL),
  SOCIAL_URL: getString('SOCIAL_URL', process.env.SOCIAL_URL),
  FILES_URL: getString('FILES_URL', process.env.FILES_URL),
  NOTIFICATIONS_URL: getString('NOTIFICATIONS_URL', process.env.NOTIFICATIONS_URL),
  PUSH_SERVER_KEY: getString('PUSH_SERVER_KEY', process.env.PUSH_SERVER_KEY),
  GTAG_ID: getString('GTAG_ID', process.env.GTAG_ID),
  FEEDBACK_URL: getString('FEEDBACK_URL', process.env.FEEDBACK_URL)
};