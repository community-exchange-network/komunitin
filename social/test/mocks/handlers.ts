import { http, HttpResponse } from 'msw'
import { getJwks } from './auth'
import { toUuid } from './utils'

let s3UploadStatus = 200

type MockCurrency = {
  id: string
  code: string
}

type MockAccount = {
  id: string
  code: string
  currencyCode: string
  userIds: string[]
}

type AccountingRequest = {
  method: string
  path: string
  authorization: string | null
}

const accountingBaseUrl = process.env.ACCOUNTING_URL ?? 'http://localhost:2025'
let accountingCurrencies = new Map<string, MockCurrency>()
let accountingAccounts = new Map<string, Map<string, MockAccount>>()
let accountingRequests: AccountingRequest[] = []

export const setS3UploadStatus = (status: number) => {
  s3UploadStatus = status
}

export const seedAccountingCurrency = (code: string, id = toUuid(`accounting-currency-${code}`)): MockCurrency => {
  const currency = { id, code }
  accountingCurrencies.set(code, currency)
  return currency
}

export const seedAccountingAccount = (
  currencyCode: string,
  code: string,
  userIds: string[] = [],
  id = toUuid(`accounting-account-${currencyCode}-${code}`),
): MockAccount => {
  const account = { id, code, currencyCode, userIds }
  const accounts = accountingAccounts.get(currencyCode) ?? new Map<string, MockAccount>()
  accounts.set(code, account)
  accountingAccounts.set(currencyCode, accounts)
  return account
}

export const getAccountingRequests = (): AccountingRequest[] => {
  return [...accountingRequests]
}

export const getAccountingRequestPaths = (): string[] => {
  return accountingRequests.map((entry) => `${entry.method} ${entry.path}`)
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
  },
})

const serializeAccount = (account: MockAccount) => ({
  type: 'accounts',
  id: account.id,
  attributes: {
    code: account.code,
  },
})

export const resetMockState = () => {
  s3UploadStatus = 200
  accountingCurrencies = new Map<string, MockCurrency>()
  accountingAccounts = new Map<string, Map<string, MockAccount>>()
  accountingRequests = []
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
        }
      }
    }

    const code = body.data?.attributes?.code
    if (typeof code !== 'string' || code.length === 0) {
      return jsonApiError(400, 'Missing currency code')
    }

    const currency = accountingCurrencies.get(code) ?? seedAccountingCurrency(code)
    return HttpResponse.json({
      data: serializeCurrency(currency),
    }, { status: 201 })
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
    const account = accountingAccounts.get(currencyCode)?.get(code)
      ?? seedAccountingAccount(currencyCode, code, userIds)

    return HttpResponse.json({
      data: serializeAccount(account),
    }, { status: 201 })
  }),
  http.put('http://s3.test/:bucket/:key*', async ({ request }) => {
    if (s3UploadStatus >= 400) {
      return HttpResponse.text('error', { status: s3UploadStatus })
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
      return HttpResponse.text('error', { status: s3UploadStatus })
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
]
