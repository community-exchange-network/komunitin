import { z } from 'zod';

const envSchema = z.object({
  KOMUNITIN_AUTH_URL: z.string().url(),
  KOMUNITIN_SOCIAL_URL: z.string().url(),
  KOMUNITIN_ACCOUNTING_URL: z.string().url(),
  OAUTH_CLIENT_ID: z.string().min(1),
  OAUTH_CLIENT_SECRET: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email(),
});

export const config = envSchema.parse(process.env);
