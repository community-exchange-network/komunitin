import { config } from '../config'
import { Scope } from '../server/scopes'
import { internalError } from '../utils/error'
import { fetchWithRetry } from './utils'

type AccountingScope = typeof Scope.AccountingRead | typeof Scope.AccountingWrite

type TokenResponse = {
  access_token?: unknown
}

const tokenUrl = new URL('/token', config.AUTH_URL).toString()

export const exchangeAccountingToken = async (
  subjectToken: string,
  scope: AccountingScope,
): Promise<string> => {
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

  if (!response.ok || typeof responseBody.access_token !== 'string') {
    throw internalError('Auth token exchange failed')
  }

  return responseBody.access_token
}
