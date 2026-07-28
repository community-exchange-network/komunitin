import { config } from "../../config"

type TokenResponse = {
  access_token?: unknown
  expires_in?: unknown
  scope?: unknown
  token_type?: unknown
}

const EXPIRY_MARGIN_MS = 60 * 1000
let cachedToken: { value: string, expiresAt: number } | undefined
let pendingToken: Promise<string> | undefined

const requestToken = async () => {
  const response = await fetch(new URL("/token", config.AUTH_URL), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.ACCOUNTING_CLIENT_ID,
      client_secret: config.ACCOUNTING_CLIENT_SECRET!,
      grant_type: "client_credentials",
      scope: "notifications:write",
    }),
  })
  const body = await response.json().catch(() => undefined) as TokenResponse | undefined

  if (
    !response.ok
    || typeof body?.access_token !== "string"
    || typeof body.expires_in !== "number"
    || body.expires_in <= 0
    || body.scope !== "notifications:write"
    || body.token_type !== "Bearer"
  ) {
    throw new Error(`Auth service token request failed with status ${response.status}`)
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000 - EXPIRY_MARGIN_MS,
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
