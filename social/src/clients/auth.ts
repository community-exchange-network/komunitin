import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CLIENT_ID, config } from '../config'
import { Scope } from '../server/scopes'
import { AsyncCache, type CacheValue } from '../utils/cache'
import { badRequest, internalError } from '../utils/error'
import { fetchWithAuth, fetchWithRetry } from './utils'

type AccountingScope = typeof Scope.AccountingRead | typeof Scope.AccountingWrite
type ServiceScope = AccountingScope | typeof Scope.NotificationsWrite

type TokenResponse = {
  access_token?: unknown
  expires_in?: unknown
  scope?: unknown
  token_type?: unknown
}

type TokenRequestParameters = Record<string, string> & {
  grant_type:
    | 'client_credentials'
    | 'urn:ietf:params:oauth:grant-type:token-exchange'
  scope: ServiceScope
}

const redeemedUnsubscribeTokenSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  purpose: z.literal('unsubscribe'),
}).strict()

type RedeemedUnsubscribeToken = z.infer<typeof redeemedUnsubscribeTokenSchema>

const tokenUrl = new URL('/token', config.AUTH_URL).toString()
const MAX_CACHED_TOKENS = 1000
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000
const tokenCache = new AsyncCache<string, string>(MAX_CACHED_TOKENS)
const serviceTokenCache = new AsyncCache<string, string>(1)
const notificationsTokenCache = new AsyncCache<string, string>(1)

const getCachedToken = async (
  cache: AsyncCache<string, string>,
  key: string,
  load: () => Promise<CacheValue<string>>,
  forceRefresh: boolean,
): Promise<string> => {
  if (forceRefresh) {
    cache.delete(key)
  }
  return cache.getOrLoad(key, load)
}

const getCacheKey = (subjectToken: string, scope: AccountingScope): string => {
  return createHash('sha256')
    .update(subjectToken)
    .update('\0')
    .update(scope)
    .digest('base64url')
}

const requestToken = async (parameters: TokenRequestParameters): Promise<CacheValue<string>> => {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: config.SOCIAL_CLIENT_SECRET,
    ...parameters,
  })
  const response = await fetchWithRetry(tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const responseBody = await response.json().catch(() => undefined) as TokenResponse | undefined
  if (
    !response.ok
    || typeof responseBody?.access_token !== 'string'
    || responseBody.scope !== parameters.scope
    || responseBody.token_type !== 'Bearer'
    || typeof responseBody.expires_in !== 'number'
    || !Number.isFinite(responseBody.expires_in)
    || responseBody.expires_in <= 0
  ) {
    throw internalError(
      parameters.grant_type === 'client_credentials'
        ? 'Auth service token request failed'
        : 'Auth token exchange failed',
    )
  }

  return {
    value: responseBody.access_token,
    expiresAt: Date.now() + responseBody.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  }
}

const requestAccountingToken = async (
  subjectToken: string,
  scope: AccountingScope,
): Promise<CacheValue<string>> => {
  return requestToken({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    scope,
  })
}

const requestSocialServiceToken = async (): Promise<CacheValue<string>> => {
  return requestToken({
    grant_type: 'client_credentials',
    scope: Scope.AccountingRead,
  })
}

const requestNotificationsToken = async (): Promise<CacheValue<string>> => {
  return requestToken({
    grant_type: 'client_credentials',
    scope: Scope.NotificationsWrite,
  })
}

/**
 * Get a service token to call the accounting service on behalf of the social service.
 */
const getSocialServiceToken = async (forceRefresh = false): Promise<string> => {
  return getCachedToken(
    serviceTokenCache,
    CLIENT_ID,
    requestSocialServiceToken,
    forceRefresh,
  )
}

export const getNotificationsToken = async (forceRefresh = false): Promise<string> => {
  return getCachedToken(
    notificationsTokenCache,
    CLIENT_ID,
    requestNotificationsToken,
    forceRefresh,
  )
}

/**
 * Resolve a replayable email unsubscribe token.
 */
export const redeemUnsubscribeToken = async (token: string): Promise<RedeemedUnsubscribeToken> => {
  const response = await fetchWithAuth(
    new URL('/redeem-action-token', config.AUTH_URL),
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, purpose: 'unsubscribe' }),
    },
    getSocialServiceToken,
  )
  const responseBody = await response.json().catch(() => undefined)
  if (response.status === 400) {
    throw badRequest('Invalid or expired unsubscribe token')
  }
  const parsed = redeemedUnsubscribeTokenSchema.safeParse(responseBody)
  if (!response.ok || !parsed.success) {
    throw internalError('Auth action token redemption failed')
  }

  return parsed.data
}

/**
 * Get an access token to call the accounting service on behalf of a user.
 */
export const exchangeAccountingToken = async (
  subjectToken: string,
  scope: AccountingScope,
  forceRefresh = false,
): Promise<string> => {
  const key = getCacheKey(subjectToken, scope)
  return getCachedToken(
    tokenCache,
    key,
    () => requestAccountingToken(subjectToken, scope),
    forceRefresh,
  )
}
