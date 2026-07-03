import { http, HttpResponse } from 'msw'
import { getJwks } from './auth'
import { toUuid } from './utils'

let s3UploadStatus = 200
let s3DeleteStatus = 204
let s3DeleteRequests: string[] = []

type MockCurrency = {
  id: string
  code: string
  status: 'active' | 'disabled' | 'deleted'
}

type MockAccount = {
  id: string
  code: string
  currencyCode: string
  userIds: string[]
  status: 'active' | 'disabled' | 'suspended' | 'deleted'
  balance: number
}

type AccountingRequest = {
  method: string
  path: string
  authorization: string | null
}

const accountingBaseUrl = process.env.ACCOUNTING_URL ?? 'http://localhost:2025'
const notificationsBaseUrl = process.env.NOTIFICATIONS_API_URL ?? 'http://notifications.test'
let accountingCurrencies = new Map<string, MockCurrency>()
let accountingAccounts = new Map<string, Map<string, MockAccount>>()
let accountingRequests: AccountingRequest[] = []
let accountingCurrencyDeleteStatus = 204
let accountingCurrencyDeleteDetail = 'Mock accounting currency delete failure'
let accountingAccountDeleteStatus = 204
let accountingAccountDeleteDetail = 'Mock accounting delete failure'
let notificationsEventStatus = 201
let notificationsEvents: unknown[] = []

type NotificationsRequest = {
  method: string
  path: string
  authorization: string | null
}

let notificationsRequests: NotificationsRequest[] = []

export const setS3UploadStatus = (status: number) => {
  s3UploadStatus = status
}

export const setS3DeleteStatus = (status: number) => {
  s3DeleteStatus = status
}

export const getS3DeleteRequests = (): string[] => {
  return [...s3DeleteRequests]
}

export const seedAccountingCurrency = (
  code: string,
  id = toUuid(`accounting-currency-${code}`),
  status: MockCurrency['status'] = 'active',
): MockCurrency => {
  const currency = { id, code, status }
  accountingCurrencies.set(code, currency)
  return currency
}

export const seedAccountingAccount = (
  currencyCode: string,
  code: string,
  userIds: string[] = [],
  id = toUuid(`accounting-account-${currencyCode}-${code}`),
  status: MockAccount['status'] = 'active',
  balance = 0,
): MockAccount => {
  const account = { id, code, currencyCode, userIds, status, balance }
  const accounts = accountingAccounts.get(currencyCode) ?? new Map<string, MockAccount>()
  accounts.set(code, account)
  accountingAccounts.set(currencyCode, accounts)
  return account
}

const findAccountingAccountById = (currencyCode: string, accountId: string): MockAccount | undefined => {
  const accounts = accountingAccounts.get(currencyCode)
  if (!accounts) {
    return undefined
  }

  for (const account of accounts.values()) {
    if (account.id === accountId) {
      return account
    }
  }

  return undefined
}

export const getAccountingRequests = (): AccountingRequest[] => {
  return [...accountingRequests]
}

export const getAccountingRequestPaths = (): string[] => {
  return accountingRequests.map((entry) => `${entry.method} ${entry.path}`)
}

export const setAccountingAccountDeleteStatus = (status: number, detail = 'Mock accounting delete failure') => {
  accountingAccountDeleteStatus = status
  accountingAccountDeleteDetail = detail
}

export const setAccountingCurrencyDeleteStatus = (status: number, detail = 'Mock accounting currency delete failure') => {
  accountingCurrencyDeleteStatus = status
  accountingCurrencyDeleteDetail = detail
}

export const setNotificationsEventStatus = (status: number) => {
  notificationsEventStatus = status
}

export const getNotificationsRequests = (): NotificationsRequest[] => {
  return [...notificationsRequests]
}

export const getNotificationsEvents = (): unknown[] => {
  return [...notificationsEvents]
}

const jsonApiError = (status: number, detail: string) => {
  return HttpResponse.json({
    errors: [{ status: String(status), detail }],
  }, { status })
}

const requireAccountingAuthorization = (request: Request): Response | null => {
  const authorization = request.headers.get('authorization')
  accountingRequests.push({
    method: request.method,
    path: new URL(request.url).pathname,
    authorization,
  })

  if (!authorization) {
    return jsonApiError(401, 'Missing authorization header')
  }

  return null
}

const serializeCurrency = (currency: MockCurrency) => ({
  type: 'currencies',
  id: currency.id,
  attributes: {
    code: currency.code,
    status: currency.status,
  },
})

const serializeAccount = (account: MockAccount) => ({
  type: 'accounts',
  id: account.id,
  attributes: {
    code: account.code,
    status: account.status,
    balance: account.balance,
  },
})

export const resetMockState = () => {
  s3UploadStatus = 200
  s3DeleteStatus = 204
  s3DeleteRequests = []
  accountingCurrencies = new Map<string, MockCurrency>()
  accountingAccounts = new Map<string, Map<string, MockAccount>>()
  accountingRequests = []
  accountingCurrencyDeleteStatus = 204
  accountingCurrencyDeleteDetail = 'Mock accounting currency delete failure'
  accountingAccountDeleteStatus = 204
  accountingAccountDeleteDetail = 'Mock accounting delete failure'
  notificationsEventStatus = 201
  notificationsEvents = []
  notificationsRequests = []
}

export const handlers = [
  http.get(process.env.AUTH_JWKS_URL!, () => {
    return HttpResponse.json(getJwks())
  }),
  http.get(`${accountingBaseUrl}/:currencyCode/currency`, ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    const currencyCode = String(params.currencyCode)
    const currency = accountingCurrencies.get(currencyCode)
    if (!currency) {
      return jsonApiError(404, `Currency ${currencyCode} not found`)
    }

    return HttpResponse.json({
      data: serializeCurrency(currency),
    })
  }),
  http.post(`${accountingBaseUrl}/currencies`, async ({ request }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    const body = await request.json() as {
      data?: {
        attributes?: {
          code?: string
          status?: string
        }
      }
    }

    const code = body.data?.attributes?.code
    if (typeof code !== 'string' || code.length === 0) {
      return jsonApiError(400, 'Missing currency code')
    }

    const currency = accountingCurrencies.get(code) ?? seedAccountingCurrency(code)

    const status = body.data?.attributes?.status
    if (status === 'active' || status === 'disabled') {
      currency.status = status
      accountingCurrencies.set(code, currency)
    }

    return HttpResponse.json({
      data: serializeCurrency(currency),
    }, { status: 201 })
  }),
  http.patch(`${accountingBaseUrl}/:currencyCode/currency`, async ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    const currencyCode = String(params.currencyCode)
    const existing = accountingCurrencies.get(currencyCode)
    if (!existing) {
      return jsonApiError(404, `Currency ${currencyCode} not found`)
    }

    const body = await request.json() as {
      data?: {
        attributes?: {
          status?: string
        }
      }
    }

    const nextStatus = body.data?.attributes?.status
    if (nextStatus === 'active' || nextStatus === 'disabled') {
      existing.status = nextStatus
      accountingCurrencies.set(currencyCode, existing)
    }

    return HttpResponse.json({
      data: serializeCurrency(existing),
    })
  }),
  http.delete(`${accountingBaseUrl}/:currencyCode/currency`, ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    if (accountingCurrencyDeleteStatus !== 204) {
      return jsonApiError(accountingCurrencyDeleteStatus, accountingCurrencyDeleteDetail)
    }

    const currencyCode = String(params.currencyCode)
    const existing = accountingCurrencies.get(currencyCode)
    if (!existing) {
      return jsonApiError(404, `Currency ${currencyCode} not found`)
    }

    existing.status = 'deleted'
    return new HttpResponse(null, { status: 204 })
  }),
  http.get(`${accountingBaseUrl}/:currencyCode/accounts`, ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    const currencyCode = String(params.currencyCode)
    const code = new URL(request.url).searchParams.get('filter[code]')
    const account = code ? accountingAccounts.get(currencyCode)?.get(code) : undefined

    return HttpResponse.json({
      data: account ? [serializeAccount(account)] : [],
    })
  }),
  http.post(`${accountingBaseUrl}/:currencyCode/accounts`, async ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    const currencyCode = String(params.currencyCode)
    const body = await request.json() as {
      data?: {
        attributes?: {
          code?: string
          status?: string
        }
        relationships?: {
          users?: {
            data?: Array<{ id: string }>
          }
        }
      }
    }

    const code = body.data?.attributes?.code
    if (typeof code !== 'string' || code.length === 0) {
      return jsonApiError(400, 'Missing account code')
    }

    const userIds = body.data?.relationships?.users?.data?.map((user) => user.id) ?? []
    const status = body.data?.attributes?.status
    const account = accountingAccounts.get(currencyCode)?.get(code)
      ?? seedAccountingAccount(
        currencyCode,
        code,
        userIds,
        toUuid(`accounting-account-${currencyCode}-${code}`),
        status === 'active' || status === 'disabled' || status === 'suspended' || status === 'deleted' ? status : 'active',
      )

    return HttpResponse.json({
      data: serializeAccount(account),
    }, { status: 201 })
  }),
  http.get(`${accountingBaseUrl}/:currencyCode/accounts/:accountId`, ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    const currencyCode = String(params.currencyCode)
    const accountId = String(params.accountId)
    const account = findAccountingAccountById(currencyCode, accountId)
    if (!account) {
      return jsonApiError(404, `Account ${accountId} not found`)
    }

    return HttpResponse.json({
      data: serializeAccount(account),
    })
  }),
  http.delete(`${accountingBaseUrl}/:currencyCode/accounts/:accountId`, ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    if (accountingAccountDeleteStatus !== 204) {
      return jsonApiError(accountingAccountDeleteStatus, accountingAccountDeleteDetail)
    }

    const currencyCode = String(params.currencyCode)
    const accountId = String(params.accountId)
    const account = findAccountingAccountById(currencyCode, accountId)
    if (!account) {
      return jsonApiError(404, `Account ${accountId} not found`)
    }

    account.status = 'deleted'
    return new HttpResponse(null, { status: 204 })
  }),
  http.patch(`${accountingBaseUrl}/:currencyCode/accounts/:accountId`, async ({ request, params }) => {
    const unauthorized = requireAccountingAuthorization(request)
    if (unauthorized) {
      return unauthorized
    }

    const currencyCode = String(params.currencyCode)
    const accountId = String(params.accountId)
    const account = findAccountingAccountById(currencyCode, accountId)
    if (!account) {
      return jsonApiError(404, `Account ${accountId} not found`)
    }

    const body = await request.json() as {
      data?: {
        attributes?: {
          status?: string
        }
      }
    }

    const nextStatus = body.data?.attributes?.status
    if (nextStatus === 'active' || nextStatus === 'disabled' || nextStatus === 'suspended' || nextStatus === 'deleted') {
      account.status = nextStatus
    }

    return HttpResponse.json({
      data: serializeAccount(account),
    })
  }),
  http.post(`${notificationsBaseUrl}/events`, async ({ request }) => {
    const authorization = request.headers.get('authorization')
    notificationsRequests.push({
      method: request.method,
      path: new URL(request.url).pathname,
      authorization,
    })

    if (notificationsEventStatus >= 400) {
      return HttpResponse.json({
        errors: [{ status: String(notificationsEventStatus), detail: 'Mock notifications failure' }],
      }, { status: notificationsEventStatus })
    }

    const expectedBasic = `Basic ${Buffer.from(`${process.env.NOTIFICATIONS_API_USERNAME}:${process.env.NOTIFICATIONS_API_PASSWORD}`).toString('base64')}`
    if (authorization !== expectedBasic) {
      return jsonApiError(401, 'Missing or invalid notifications authorization header')
    }

    const body = await request.json() as Record<string, unknown>
    notificationsEvents.push(body)

    return HttpResponse.json({
      data: {
        type: 'events',
        id: 'mock-event-id',
        attributes: {
          name: (body.data as any)?.attributes?.name,
        },
      },
    }, { status: 201 })
  }),
  http.put('http://s3.test/:bucket/:key*', async ({ request }) => {
    if (s3UploadStatus >= 400) {
      return HttpResponse.text('<Error><Code>InternalError</Code><Message>error</Message></Error>', {
        status: s3UploadStatus,
        headers: {
          'content-type': 'application/xml',
        },
      })
    }

    const body = await request.arrayBuffer()
    if (body.byteLength === 0) {
      return new HttpResponse(null, { status: 400 })
    }

    return HttpResponse.text('', {
      status: 200,
      headers: {
        etag: '"mock-etag"',
      },
    })
  }),
  http.put('http://:bucket.s3.test/:key*', async ({ request }) => {
    if (s3UploadStatus >= 400) {
      return HttpResponse.text('<Error><Code>InternalError</Code><Message>error</Message></Error>', {
        status: s3UploadStatus,
        headers: {
          'content-type': 'application/xml',
        },
      })
    }

    const body = await request.arrayBuffer()
    if (body.byteLength === 0) {
      return new HttpResponse(null, { status: 400 })
    }

    return HttpResponse.text('', {
      status: 200,
      headers: {
        etag: '"mock-etag"',
      },
    })
  }),
  http.delete('http://s3.test/:bucket/:key*', ({ request }) => {
    s3DeleteRequests.push(request.url)
    if (s3DeleteStatus >= 400) {
      return HttpResponse.text('<Error><Code>InternalError</Code><Message>error</Message></Error>', {
        status: s3DeleteStatus,
        headers: {
          'content-type': 'application/xml',
        },
      })
    }

    return HttpResponse.text('', { status: 200 })
  }),
  http.delete('http://:bucket.s3.test/:key*', ({ request }) => {
    s3DeleteRequests.push(request.url)
    if (s3DeleteStatus >= 400) {
      return HttpResponse.text('<Error><Code>InternalError</Code><Message>error</Message></Error>', {
        status: s3DeleteStatus,
        headers: {
          'content-type': 'application/xml',
        },
      })
    }

    return HttpResponse.text('', { status: 200 })
  }),
]
