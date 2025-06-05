import {describe, it} from "node:test"
import assert from "node:assert"
import {validate as isUuid} from "uuid"
import { Scope } from "src/server/auth"
import { setupServerTest } from "./setup"

describe('Currencies endpoints', async () => {
  const t = setupServerTest(false)

  const admin1 = {user: "1", scopes: [Scope.Accounting]}
  const admin2 = {user: "2", scopes: [Scope.Accounting]}

  const currencyPostBody = (attributes: Record<string, any>, user: string, settings: Record<string, any>) => ({
    data: {
      type: "currencies",
      attributes: {
        code: "TES1",
        name: "Testy",
        namePlural: "Testies",
        symbol: "T$",
        decimals: 2,
        scale: 4,
        rate: {n: 1, d: 10},
        ...attributes,
      },
      relationships: {
        admins: {
          data: [{ type: "users", id: user }]
        },
        settings: {
          data: { type: "currency-settings", id: "1" }
        }
      }
    },
    included: [{
      type: "users",
      id: user
    }, {
      type: "currency-settings",
      id: "1",
      attributes: {
        defaultInitialCreditLimit: 1000,
        ...settings
      }
    }]
  })
  
  await it('create currency', async () => {
    // User 1 creates currency TES1
    const currency = currencyPostBody({code:"TES1"}, "1", {})
    const response = await t.api.post('/currencies', currency, admin1)
    assert(isUuid(response.body.data.id), "The currency id is not a valid UUID")
    assert.equal(response.body.data.type, 'currencies')
    assert.equal(response.body.data.attributes.code, 'TES1')
    assert.equal(response.body.data.attributes.name, 'Testy')
    assert.equal(response.body.data.attributes.rate.n, 1)
    assert.equal(response.body.data.attributes.rate.d, 10)

    // Check default settings.
    const response2 = await t.api.get('/TES1/currency?include=settings')
    const settings = response2.body.included.find((i: any) => i.type === "currency-settings")
    assert(isUuid(settings.id), "The settings id is not a valid UUID")
    assert.equal(settings.attributes.defaultInitialCreditLimit, 1000)
  })

  // Helper doing an authenticated post to /currencies, expecting a 400 error.
  const badPost = async (attributes?: any) => {
    const currency = currencyPostBody(attributes, "400", {})
    const user400 = {user: "400", scopes: [Scope.Accounting]}
    const response = await t.api.post('/currencies', currency, user400, 400)
    assert.equal(response.body.errors[0].status, 400) 
  }

  await it('create currency with maxBalance', async () => {
    // User 2 creates currency TES2 with maximum balance defined.
    const currency = currencyPostBody({code:"TES2"}, "2", { defaultInitialMaximumBalance: 5000, defaultInitialCreditLimit: undefined })
    await t.api.post('/currencies', currency, admin2)

    const response2 = await t.api.get('/TES2/currency?include=settings')
    const settings = response2.body.included.find((i: any) => i.type === "currency-settings")
    assert.equal(settings.attributes.defaultInitialMaximumBalance, 5000)
    assert.equal(settings.attributes.defaultInitialCreditLimit, 0)
  })

  it('repeated code', async () => badPost({code: "TES1"}))
  it('incorrect code', async () => badPost({code: "EUR", rate: undefined}))
  it('missing rate', async () => badPost({code: "ERRO", rate: undefined}))
  it('incorrect div by zero rate', async () => badPost({code: "ERRO", rate: {n: 1, d: 0}}))
  it('incorrect zero rate', async () => badPost({code: "ERRO", rate: {n: 0, d: 1}}))
  it('incorrect negative rate', async () => badPost({code: "ERRO", rate: {n: -1, d: 1}}))
  
  // Only logged in users with komunitin_accounting scope can create currencies.
  it('unauthorized create', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), undefined, 401)
  })
  it('missing scope create', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), {user: "400", scopes: []}, 403)
  })

  // public endpoint
  it('list currencies', async () => {
    const response = await t.api.get('/currencies')
    assert(Array.isArray(response.body.data))
    assert.equal(response.body.data.length,2)
    assert.equal(response.body.data[0].attributes.code, 'TES1')
    assert.equal(response.body.data[1].attributes.code, 'TES2')
  })
  
  // public endpoint
  it('get currency', async () => {
    const response = await t.api.get('/TES1/currency')
    assert.equal(response.body.data.attributes.code, 'TES1')
  })
  
  it('not found currency', async () => {
    await t.api.get('/ERRO/currency', undefined, 404)
  })

  await it('can update currency', async () => {
    const response = await t.api.patch('/TES2/currency', {data: {
      attributes: {
        name: "Testy2",
        namePlural: "Testies2",
      }
    }}, admin2)
    assert.equal(response.body.data.attributes.name, 'Testy2')
    assert.equal(response.body.data.attributes.namePlural, 'Testies2')
  })
  it('can update currency settings', async () => {
    const response = await t.api.patch('/TES2/currency/settings', {data: {
      attributes: {
        defaultInitialCreditLimit: 2000
      }
    }}, admin2)
    assert.equal(response.body.data.attributes.defaultInitialCreditLimit, 2000)
  })
  
  it('can update all currency settings', async () => {
    const response = await t.api.patch('/TES2/currency/settings', {data: {
      attributes: {
        defaultInitialCreditLimit: 2500,
        defaultInitialMaximumBalance: undefined,
        defaultAllowPayments: true,
        defaultAllowPaymentRequests: true,
        defaultAcceptPaymentsAutomatically: false,
        defaultAcceptPaymentsWhitelist: [],
        defaultAllowSimplePayments: true,
        defaultAllowSimplePaymentRequests: false,
        defaultAllowQrPayments: true,
        defaultAllowQrPaymentRequests: true,
        defaultAllowMultiplePayments: true,
        defaultAllowMultiplePaymentRequests: false,
        defaultAllowTagPayments: true,
        defaultAllowTagPaymentRequests: false,
        defaultAcceptPaymentsAfter: 60*60*24*7,
        defaultOnPaymentCreditLimit: undefined,
        enableExternalPayments: true,
        enableExternalPaymentRequests: true,
        defaultAllowExternalPayments: true,
        defaultAllowExternalPaymentRequests: false,
        defaultAcceptExternalPaymentsAutomatically: false,
        defaultHideBalance: false,
      }
    }}, admin2)

    assert.equal(response.body.data.attributes.defaultInitialCreditLimit, 2500)
    assert.equal(response.body.data.attributes.defaultAllowSimplePayments, true)
    assert.equal(response.body.data.attributes.defaultAllowSimplePaymentRequests, false)

  })

  it.todo('can update external trader settings', async () => {
    const response = await t.api.patch('/TES2/currency/settings', {data: {
      attributes: {
        externalTraderCreditLimit: 25000,
        externalTraderMaximumBalance: 25000
      }
    }}, admin2)
    assert.equal(response.body.data.attributes.externalTraderCreditLimit, 25000)
    assert.equal(response.body.data.attributes.externalTraderMaximumBalance, 25000)
  })

  it('currency code cant be updated', async () => {
    await t.api.patch('/TES2/currency', {data: { attributes: { code: "ERRO" } }}, admin2, 400)
  })
  it('curency id cant be updated', async () => {
    await t.api.patch('/TES2/currency', {data: { id: "change-id" }}, admin2, 400)
  })
  it('forbidden update', async () => {
    await t.api.patch('/TES2/currency', {data: { attributes: { name: "Error" } }}, admin1, 403)
    await t.api.patch('/TES2/currency/settings', {data: { attributes: { defaultInitialCreditLimit: 1234 } }}, admin1, 403)
  })
  it('unauthenticated update', async () => {
    await t.api.patch('/TES2/currency', {data: { attributes: { name: "Error" } }}, undefined, 401)
    await t.api.patch('/TES2/currency/settings', {data: { attributes: { defaultInitialCreditLimit: 1234 } }}, undefined, 401)
  })

})
