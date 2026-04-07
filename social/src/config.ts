import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(2028),
  AUTH_JWT_ISSUER: z.string().default('https://komunitin.org'),
  AUTH_JWT_AUDIENCE: z.string().default('komunitin-app').transform((s) => s.split(',')),
  AUTH_JWKS_URL: z.url().default('https://komunitin.org/.well-known/jwks.json'),
})

export const config = envSchema.parse(process.env)
