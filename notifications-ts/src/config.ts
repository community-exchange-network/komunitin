import { z } from 'zod';

const envSchema = z.object({
  KOMUNITIN_AUTH_URL: z.string().url(),
  KOMUNITIN_SOCIAL_URL: z.string().url(),
  KOMUNITIN_SOCIAL_PUBLIC_URL: z.string().url(),
  KOMUNITIN_ACCOUNTING_URL: z.string().url(),
  KOMUNITIN_APP_URL: z.string().url(),
  AUTH_JWT_ISSUER: z.string().default('https://komunitin.org'),
  AUTH_JWT_AUDIENCE: z.string().default('komunitin-notifications'),
  AUTH_JWKS_URL: z.string().url().default('https://komunitin.org/.well-known/jwks.json'),
  NOTIFICATIONS_CLIENT_ID: z.string().min(1),
  NOTIFICATIONS_CLIENT_SECRET: z.string().min(1),
  NOTIFICATIONS_REDIS_URL: z.string().url().default('redis://db-notifications:6379'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  APP_EMAIL: z.string().optional(),
  DEV_SAVE_NEWSLETTERS: z.coerce.boolean().optional().default(false),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const config = envSchema.parse(process.env);
