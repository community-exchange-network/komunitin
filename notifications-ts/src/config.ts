import { z } from 'zod';

const envSchema = z.object({
  KOMUNITIN_AUTH_URL: z.string().url(),
  KOMUNITIN_SOCIAL_URL: z.string().url(),
  KOMUNITIN_ACCOUNTING_URL: z.string().url(),
  KOMUNITIN_APP_URL: z.string().url(),
  OAUTH_CLIENT_ID: z.string().min(1),
  OAUTH_CLIENT_SECRET: z.string().min(1),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  DEV_SAVE_NEWSLETTERS: z.coerce.boolean().optional().default(false),
});

export const config = envSchema.parse(process.env);
