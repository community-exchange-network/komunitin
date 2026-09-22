import { createHash } from 'node:crypto'
import { z } from 'zod'
import { CLIENT_ID, config } from '../config'
import { Scope } from '../server/scopes'
import { AsyncCache, type CacheValue } from '../utils/cache'
import { badRequest, internalError } from '../utils/error'
import { fetchWithAuth, fetchWithRetry } from './utils'

type AccountingTokenScope =
  | typeof Scope.AccountingRead
  | typeof Scope.AccountingWrite
  | typeof Scope.Superadmin
type TokenScope = AccountingTokenScope | typeof Scope.NotificationsWrite

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
  scope: TokenScope
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
const serviceTokenCache = new AsyncCache<string, string>(2)
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

const getCacheKey = (subjectToken: string, scope: AccountingTokenScope): string => {
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
  scope: AccountingTokenScope,
): Promise<CacheValue<string>> => {
  return requestToken({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    scope,
  })
}

const requestSocialServiceToken = async (scope: AccountingTokenScope): Promise<CacheValue<string>> => {
  return requestToken({
    grant_type: 'client_credentials',
    scope,
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
export const getSocialServiceToken = async (forceRefresh = false, scope: AccountingTokenScope = Scope.AccountingRead): Promise<string> => {
  return getCachedToken(
    serviceTokenCache,
    scope,
    () => requestSocialServiceToken(scope),
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

const redeemedDeletionSchema = z.object({
  userId: z.uuid(),
  data: z.uuid(),
})

/** Redeem a deletion token bound to this membership, without creating a user session. */
export const redeemMemberDeletionToken = async (token: string, memberId: string) => {
  const response = await fetchWithAuth(new URL('/redeem-action-token', config.AUTH_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, purpose: 'memberDeletion' }),
  }, getSocialServiceToken)
  if (response.status === 400) {
    throw badRequest('Invalid or expired deletion token. Request a new confirmation email.')
  }
  if (!response.ok) {
    throw internalError('Auth action token redemption failed')
  }
  const redeemed = redeemedDeletionSchema.parse(await response.json())
  if (redeemed.data !== memberId) {
    throw badRequest('Deletion token does not match this membership')
  }
  return redeemed
}

/**
 * Get an access token to call the accounting service on behalf of a user.
 */
export const exchangeAccountingToken = async (
  subjectToken: string,
  scope: AccountingTokenScope,
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

/** Delete an identity after Social has removed its last membership. Safe to retry. */
export const deleteIdentity = async (userId: string): Promise<void> => {
  const response = await fetchWithAuth(
    new URL(`/users/${userId}`, config.AUTH_URL),
    { method: 'DELETE' },
    getSocialServiceToken,
  )
  if (response.status !== 204) {
    throw internalError('Auth identity deletion failed')
  }
}
