import { z } from 'zod'
import { config } from '../config'

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.literal('notifications:write'),
  token_type: z.literal('Bearer'),
})

const EXPIRY_MARGIN_MS = 60 * 1000
let cachedToken: { value: string, expiresAt: number } | undefined
let pendingToken: Promise<string> | undefined

const requestToken = async () => {
  const response = await fetch(new URL('/token', config.JWT_ISSUER), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.AUTH_CLIENT_ID,
      client_secret: config.AUTH_CLIENT_SECRET,
      grant_type: 'client_credentials',
      scope: 'notifications:write',
    }),
  })
  const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => undefined))

  if (!response.ok || !parsed.success) {
    throw new Error(`Auth service token request failed with status ${response.status}`)
  }

  cachedToken = {
    value: parsed.data.access_token,
    expiresAt: Date.now() + parsed.data.expires_in * 1000 - EXPIRY_MARGIN_MS,
  }
  return cachedToken.value
}

export const getNotificationsToken = async (forceRefresh = false) => {
  if (forceRefresh) {
    cachedToken = undefined
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value
  }
  if (!pendingToken) {
    pendingToken = requestToken().finally(() => {
      pendingToken = undefined
    })
  }
  return pendingToken
}
