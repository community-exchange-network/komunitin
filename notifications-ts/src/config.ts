import { z } from 'zod';

const envSchema = z.object({
  KOMUNITIN_AUTH_URL: z.string().url(),
  KOMUNITIN_SOCIAL_URL: z.string().url(),
  KOMUNITIN_SOCIAL_PUBLIC_URL: z.string().url(),
  KOMUNITIN_ACCOUNTING_URL: z.string().url(),
  KOMUNITIN_APP_URL: z.string().url(),
  AUTH_JWT_ISSUER: z.string().default('https://komunitin.org'),
  AUTH_JWT_AUDIENCE: z.string().default('komunitin-app,komunitin-notifications').transform((s) => s.split(',')),
  AUTH_JWKS_URL: z.string().url().default('https://komunitin.org/.well-known/jwks.json'),
  NOTIFICATIONS_CLIENT_ID: z.string().min(1),
  NOTIFICATIONS_CLIENT_SECRET: z.string().min(1),
  REDIS_URL: z.string().url().default('redis://db-notifications:6379'),
  // If left empty, no email will be sent
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  APP_EMAIL: z.string(),
  // Superadmin email for system-level notifications (e.g. GroupRequested)
  ADMIN_EMAIL: z.string().email().optional(),

  // If left empty, push notifications will be disabled
  PUSH_NOTIFICATIONS_VAPID_PUBLIC_KEY: z.string().optional(),
  PUSH_NOTIFICATIONS_VAPID_PRIVATE_KEY: z.string().optional(),

  DEV_SAVE_NEWSLETTERS: z.coerce.boolean().optional().default(false),
  PORT: z.coerce.number().int().positive().default(2023),
});

export const config = envSchema.parse(process.env);

// Extra validations
if (!(config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER && config.SMTP_PASS)) {
  console.warn('SMTP configuration incomplete, email notifications will be disabled');
}

if (!config.PUSH_NOTIFICATIONS_VAPID_PUBLIC_KEY || !config.PUSH_NOTIFICATIONS_VAPID_PRIVATE_KEY) {
  console.warn('VAPID keys for push notifications not set, push notifications will be disabled');
}
