import { config } from '../config'
import { badRequest, forbidden, internalError, unauthorized } from '../utils/error'

type JsonApiErrorObject = {
  title?: string
  detail?: string
}

type JsonApiResource = {
  id: string
  type: string
  attributes?: {
    code?: string
  }
}

export type AccountingCurrencyLink = {
  id: string
}

export type AccountingAccountLink = {
  id: string
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '')

const accountingUrl = (path: string): string => {
  return `${trimTrailingSlash(config.ACCOUNTING_URL)}${path}`
}

const getErrorMessage = (errors: JsonApiErrorObject[] | undefined, fallback: string): string => {
  return errors?.find((error) => typeof error.detail === 'string' && error.detail.length > 0)?.detail
    ?? errors?.find((error) => typeof error.title === 'string' && error.title.length > 0)?.title
    ?? fallback
}

const toAccountingError = (status: number, errors: JsonApiErrorObject[] | undefined, fallback: string) => {
  const message = getErrorMessage(errors, fallback)
  const details = errors ? { errors } : undefined

  if (status === 400) {
    return badRequest(message, { details })
  }
  if (status === 401) {
    return unauthorized(message, { details })
  }
  if (status === 403) {
    return forbidden(message, { details })
  }

  return internalError(message, { details })
}

const parseJsonBody = async <T>(response: Response): Promise<T | undefined> => {
  return response.headers.get('content-type')?.includes('json')
    ? await response.json() as T
    : undefined
}

const requestAccounting = async (
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  allowNotFound = false,
): Promise<unknown> => {
  let response: Response
  try {
    response = await fetch(accountingUrl(path), {
      ...init,
      headers: {
        Accept: 'application/vnd.api+json',
        ...init.body ? { 'Content-Type': 'application/vnd.api+json' } : {},
        ...init.headers,
      },
    })
  } catch (cause) {
    throw internalError(fallbackMessage, { cause })
  }

  const body = await parseJsonBody<{ errors?: JsonApiErrorObject[] }>(response)

  if (allowNotFound && response.status === 404) {
    return undefined
  }

  if (!response.ok) {
    throw toAccountingError(response.status, body?.errors, fallbackMessage)
  }

  return body
}

const requireResource = (
  document: unknown,
  type: string,
  fallbackMessage: string,
): JsonApiResource => {
  const resource = (document as { data?: JsonApiResource } | undefined)?.data
  if (!resource || resource.type !== type) {
    throw internalError(fallbackMessage)
  }

  return resource
}

const requireCollection = (
  document: unknown,
  fallbackMessage: string,
): JsonApiResource[] => {
  const data = (document as { data?: JsonApiResource[] } | undefined)?.data
  if (!Array.isArray(data)) {
    throw internalError(fallbackMessage)
  }

  return data
}

const userIncluded = (userIds: string[]) => userIds.map((id) => ({
  type: 'users',
  id,
}))

const authorizationHeaders = (authorization: string) => ({ Authorization: authorization })

const resourceLink = (resource: JsonApiResource) => ({ id: resource.id })

export const getAccountingCurrencyHref = (code: string): string => accountingUrl(`/${code}/currency`)

export const getAccountingAccountHref = (currencyCode: string, accountId: string): string => {
  return accountingUrl(`/${currencyCode}/accounts/${accountId}`)
}

export const getAccountingCurrencyByCode = async (
  code: string,
  authorization: string,
): Promise<AccountingCurrencyLink | undefined> => {
  const document = await requestAccounting(
    `/${code}/currency`,
    {
      method: 'GET',
      headers: authorizationHeaders(authorization),
    },
    `Failed to fetch accounting currency ${code}`,
    true,
  )

  if (!document) {
    return undefined
  }

  return resourceLink(requireResource(document, 'currencies', `Invalid accounting currency response for ${code}`))
}

export const createAccountingCurrency = async (
  attributes: Record<string, unknown>,
  adminUserIds: string[],
  authorization: string,
): Promise<AccountingCurrencyLink> => {
  const document = await requestAccounting(
    '/currencies',
    {
      method: 'POST',
      headers: authorizationHeaders(authorization),
      body: JSON.stringify({
        data: {
          type: 'currencies',
          attributes,
          relationships: {
            admins: {
              data: adminUserIds.map((id) => ({ type: 'users', id }))
            },
          },
        },
        included: userIncluded(adminUserIds),
      }),
    },
    'Failed to create accounting currency',
  )

  return resourceLink(requireResource(document, 'currencies', 'Invalid accounting currency create response'))
}

export const findAccountByCode = async (
  currencyCode: string,
  accountCode: string,
  authorization: string,
): Promise<AccountingAccountLink | undefined> => {
  const query = new URLSearchParams({ 'filter[code]': accountCode })
  const document = await requestAccounting(
    `/${currencyCode}/accounts?${query.toString()}`,
    {
      method: 'GET',
      headers: authorizationHeaders(authorization),
    },
    `Failed to fetch accounting accounts for ${currencyCode}`,
  )

  const resources = requireCollection(document, `Invalid accounting account list response for ${currencyCode}`)
  const resource = resources.find((candidate) => candidate.attributes?.code === accountCode)
  return resource ? resourceLink(resource) : undefined
}

export const createAccount = async (
  currencyCode: string,
  accountCode: string,
  userIds: string[],
  authorization: string,
): Promise<AccountingAccountLink> => {
  const document = await requestAccounting(
    `/${currencyCode}/accounts`,
    {
      method: 'POST',
      headers: authorizationHeaders(authorization),
      body: JSON.stringify({
        data: {
          type: 'accounts',
          attributes: {
            code: accountCode,
          },
          relationships: {
            users: {
              data: userIds.map((id) => ({ type: 'users', id })),
            },
          },
        },
        included: userIncluded(userIds),
      }),
    },
    `Failed to create accounting account ${accountCode}`,
  )

  return resourceLink(requireResource(document, 'accounts', `Invalid accounting account create response for ${accountCode}`))
}
