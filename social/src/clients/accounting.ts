import { config } from '../config'
import { AuthContext } from '../server/context'
import { badRequest, forbidden, internalError, unauthorized } from '../utils/error'

type JsonApiError = {
  status: string
  code: string
  title: string
  detail: string
}

type JsonApiResource = {
  id: string
  type: string
  attributes?: Record<string, unknown>
}

type JsonApiDoc = {
  data?: JsonApiResource | JsonApiResource[]
  errors?: JsonApiError[]
}

export type CurrencyStatus = "new" | "active" | "disabled"
export type Currency = {
  id: string
  type: "currencies"
  code: string
  status: CurrencyStatus
  [key: string]: unknown
}

export type AccountStatus = "active" | "disabled" | "suspended" | "deleted"
export type Account = {
  id: string
  type: "accounts"
  code: string
  status: AccountStatus
  [key: string]: unknown
}


const accountingUrl = (path: string): string => {
  return `${config.ACCOUNTING_URL}${path}`
}

const toError = (status: number, errors: JsonApiError[] | undefined, fallback: string) => {
  const message = errors && errors.length > 0 ? (errors[0].detail || errors[0].title || fallback) : fallback

  const details = errors ? { details: errors } : undefined

  if (status === 400) {
    return badRequest(message, details)
  }
  if (status === 401) {
    return unauthorized(message, details)
  }
  if (status === 403) {
    return forbidden(message, details)
  }

  return internalError(message, details)
}

const parseJsonBody = async <T>(response: Response): Promise<T | undefined> => {
  return response.headers.get('content-type')?.includes('json')
    ? await response.json() as T
    : undefined
}


const fetchWithRetry = async (input: string | URL | Request, init?: RequestInit, retries = 3, retryDelay = 1000): Promise<Response> => {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Don't retry aborted requests
      throw error
    }
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
      return fetchWithRetry(input, init, retries - 1, retryDelay * 2)
    }
    throw error
  }
}

// Merge attributes into top-level of resource for convenience.
const toResource = (data: JsonApiResource | JsonApiResource[] | undefined) => {
  if (Array.isArray(data)) {
    throw internalError('Expected single resource but got an array')
  }
  if (typeof data === 'object' && data !== null && 'id' in data && 'type' in data) {
    const { id, type, attributes } = data as JsonApiResource
    return { id, type, ...attributes }
  }
  return undefined
}

const userMap = (ids: string[]) => ids.map((id) => ({ type: 'users', id }))

class AccountingClient {
  constructor(readonly ctx: AuthContext) {}

  private async getAuthorizationToken(): Promise<string> {
    // As of now, we simply forward the user's JWT token to the accounting service for authentication,
    // but we are prepared to implement a token exchange mechanis when the auth service supports it.
    return this.ctx.authorization
  }

  private async request(path: string, init: RequestInit, allowNotFound = false): Promise<JsonApiDoc | undefined> {
    const token = await this.getAuthorizationToken()
    try {
      const response = await fetchWithRetry(accountingUrl(path), {
        ...init,
        headers: {
          Accept: 'application/vnd.api+json',
          ...(init.body ? { 'Content-Type': 'application/vnd.api+json' } : {}),
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
      })
      if (allowNotFound && response.status === 404) {
        return undefined
      }

      const body = await parseJsonBody<JsonApiDoc>(response)

      if (!response.ok) {
        throw toError(response.status, body?.errors, 'Accounting service error')
      }

      return body

    } catch (cause) {
      // Network or other unexpected error
      throw internalError('Failed to fetch accounting data', { cause })
    }
  }

  public async findCurrencyByCode(code: string): Promise<Currency | undefined> {
    const response = await this.request(`/${code}/currency`, {}, true)
    return toResource(response?.data) as Currency | undefined
  }

  public async createCurrency(attributes: Record<string, unknown>, adminUserIds: string[]): Promise<Currency> {
    const response = await this.request(
      '/currencies',
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'currencies',
            attributes,
            relationships: {
              admins: {
                data: userMap(adminUserIds)
              },
            },
          },
          included: userMap(adminUserIds),
        }),
      },
    )
    const resource = toResource(response?.data)
    if (!resource) {
      throw internalError('Invalid response from accounting service when creating currency')
    }
    return resource as Currency
  }

  public async updateCurrency(currencyCode: string, attributes: Record<string, unknown>): Promise<Currency> {
    const response = await this.request(
      `/${currencyCode}/currency`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            type: 'currencies',
            id: currencyCode,
            attributes,
          },
        }),
      },
    )
    const resource = toResource(response?.data)
    if (!resource) {
      throw internalError('Invalid response from accounting service when updating currency')
    }
    return resource as Currency
  }

  public async findAccountByCode(currencyCode: string, accountCode: string): Promise<Account|undefined> {
    const response = await this.request(
      `/${currencyCode}/accounts?filter[code]=${encodeURIComponent(accountCode)}`,
      {},
    )
    const resources = Array.isArray(response?.data) ? response.data : []
    if (resources.length > 0) {
      return toResource(resources[0]) as Account
    }
    return undefined
  }

  public async getAccount(currencyCode: string, accountId: string): Promise<Account> {
    const response = await this.request(
      `/${currencyCode}/accounts/${accountId}`,
      {},
    )
    const resource = toResource(response?.data)
    if (!resource) {
      throw internalError('Invalid response from accounting service when fetching account')
    }
    return resource as Account
  }

  public async createAccount(currencyCode: string, attributes: Record<string, unknown>, userIds: string[]): Promise<Account> {
    const response = await this.request(
      `/${currencyCode}/accounts`,
      {
        method: 'POST',
        body: JSON.stringify({
          data: {
            type: 'accounts',
            attributes,
            relationships: {
              users: {
                data: userMap(userIds),
              },
            },
          },
          included: userMap(userIds),
        }),
      },
    )
    const resource = toResource(response?.data)
    if (!resource) {
      throw internalError('Invalid response from accounting service when creating account')
    }
    return resource as Account
  }

  async updateAccount(currencyCode: string, accountId: string, attributes: Record<string, unknown>): Promise<Account> {
    const response = await this.request(
      `/${currencyCode}/accounts/${accountId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          data: {
            type: 'accounts',
            id: accountId,
            attributes,
          },
        }),
      },
    )
    const resource = toResource(response?.data)
    if (!resource) {
      throw internalError('Invalid response from accounting service when updating account')
    }
    return resource as Account
  }
}

export const createAccountingClient = (ctx: AuthContext) => {
  return new AccountingClient(ctx)
}

export const getAccountingCurrencyUrl = (code: string) => {
  return accountingUrl(`/${code}/currency`)
}

export const getAccountingAccountUrl = (currencyCode: string, accountId: string) => {
  return accountingUrl(`/${currencyCode}/accounts/${accountId}`)
}

