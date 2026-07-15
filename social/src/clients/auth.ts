import { config } from '../config'
import { Scope } from '../server/scopes'
import { AsyncCache, type CacheValue } from '../utils/cache'
import { internalError } from '../utils/error'
import { fetchWithRetry } from './utils'

type AccountingScope = typeof Scope.AccountingRead | typeof Scope.AccountingWrite

type TokenResponse = {
  access_token?: unknown
  expires_in?: unknown
  scope?: unknown
}

const tokenUrl = new URL('/token', config.AUTH_URL).toString()
const MAX_CACHED_TOKENS = 1000
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000
const tokenCache = new AsyncCache<string, string>(MAX_CACHED_TOKENS)

const getCacheKey = (subjectToken: string, scope: AccountingScope): string => {
  return JSON.stringify([subjectToken, scope])
}

const requestAccountingToken = async (
  subjectToken: string,
  scope: AccountingScope,
): Promise<CacheValue<string>> => {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    client_id: config.SOCIAL_CLIENT_ID,
    client_secret: config.SOCIAL_CLIENT_SECRET,
    subject_token: subjectToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    scope,
  })

  const response = await fetchWithRetry(tokenUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const responseBody = await response.json() as TokenResponse

  if (
    !response.ok
    || typeof responseBody.access_token !== 'string'
    || responseBody.scope !== scope
    || typeof responseBody.expires_in !== 'number'
    || !Number.isFinite(responseBody.expires_in)
    || responseBody.expires_in <= 0
  ) {
    throw internalError('Auth token exchange failed')
  }

  return {
    value: responseBody.access_token,
    expiresAt: Date.now() + responseBody.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS,
  }
}

export const exchangeAccountingToken = async (
  subjectToken: string,
  scope: AccountingScope,
): Promise<string> => {
  const key = getCacheKey(subjectToken, scope)
  return tokenCache.getOrLoad(key, () => requestAccountingToken(subjectToken, scope))
}
