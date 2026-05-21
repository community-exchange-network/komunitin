import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(2028),
  DATABASE_URL: z.string().default('postgresql://social:social@localhost:5434/social?schema=public'),
  API_BASE_URL: z.string().default('http://localhost:2028'),
  AUTH_JWT_ISSUER: z.string().default('https://komunitin.org'),
  AUTH_JWT_AUDIENCE: z.string().default('komunitin-app').transform((s) => s.split(',')),
  AUTH_JWKS_URL: z.url().default('https://komunitin.org/.well-known/jwks.json'),
  UPLOAD_S3_PREFIX: z.url({protocol: /^s3:$/}).default('s3://komunitin/uploads'),
  UPLOAD_S3_ENDPOINT: z.url().default('http://s3.test'),
  UPLOAD_S3_REGION: z.string().trim().min(1).default('us-east-1'),
  UPLOAD_S3_ACCESS_KEY: z.string().trim().min(1).default('test-access-key'),
  UPLOAD_S3_SECRET_KEY: z.string().trim().min(1).default('test-secret-key'),
  UPLOAD_S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  UPLOAD_PUBLIC_URL: z.url().optional(),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  UPLOAD_ALLOWED_MIME_TYPES: z.string()
    .default('image/jpeg,image/png,image/webp,image/gif')
    .transform((s) => s.split(',').map((it) => it.trim()).filter(Boolean)),
})

export const config = envSchema.parse(process.env)
