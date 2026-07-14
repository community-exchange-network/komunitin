import { z } from 'zod'
import { mailboxEmailSchema } from './utils/email'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(2026),
  DATABASE_URL: z.string().default('postgresql://auth:auth@localhost:5435/auth?schema=public'),
  ISSUER_URL: z.string().default('http://localhost:2026'),
  NOTIFICATIONS_URL: z.string().default('http://localhost:2023'),
  NOTIFICATIONS_EVENTS_USERNAME: z.string().min(1).default('komunitin'),
  NOTIFICATIONS_EVENTS_PASSWORD: z.string().min(1).default('replace-this-with-a-secure-password'),
  NOTIFICATIONS_CLIENT_SECRET: z.string().min(1).default('replace-this-with-a-secure-password'),
  SOCIAL_CLIENT_SECRET: z.string().min(1).default('komunitin-social-secret'),
  ADMIN_EMAIL: mailboxEmailSchema,
  JWKS_ROTATION_INTERVAL_DAYS: z.coerce.number().int().positive().default(90),
  JWKS_RETENTION_HOURS: z.coerce.number().int().positive().default(24),
  RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
})

export const config = envSchema.parse(process.env)
