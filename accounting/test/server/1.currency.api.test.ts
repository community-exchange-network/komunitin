import {describe, it} from "node:test"
import assert from "node:assert"
import {validate as isUuid} from "uuid"
import { Scope } from "../../src/server/auth"
import { setupServerTest } from "./setup"
import { testUserId, userAuth } from "./api.data"
import { config } from "../../src/config"

describe('Currencies endpoints', async () => {
  const t = setupServerTest(false)

  const admin1 = userAuth("1")
  const admin2 = userAuth("2")
  const superadmin = userAuth("superadmin", [Scope.Superadmin])

  const currencyPostBody = (attributes: Record<string, any>, user: string, settings: Record<string, any>) => {
    const userId = testUserId(user)
    return {
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
            data: [{ type: "users", id: userId }]
          },
          settings: {
            data: { type: "currency-settings", id: "1" }
          }
        }
      },
      included: [{
        type: "users",
        id: userId
      }, {
        type: "currency-settings",
        id: "1",
        attributes: {
          defaultInitialCreditLimit: 1000,
          ...settings
        }
      }]
    }
  }
  
  await it('create currency with default settings', async () => {
    // User 1 creates currency TES1, without included settings object.
    const currencyWithSettings = currencyPostBody({code:"TES1"}, "1", {})
    const currency = {
      ...currencyWithSettings,
      data: {
        ...currencyWithSettings.data,
        relationships: {
          admins: currencyWithSettings.data.relationships.admins
        }
      },
      included: currencyWithSettings.included.filter(({ type }) => type !== "currency-settings")
    }
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
    assert.equal(settings.attributes.defaultInitialCreditLimit, 1000000)
  })

  // Helper doing an authenticated post to /currencies, expecting a 400 error.
  const badPost = async (attributes?: any) => {
    const currency = currencyPostBody(attributes, "400", {})
    const user400 = userAuth("400", [Scope.AccountingWrite])
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
    // 12h * 10 (rate) * 10^4 (scale) = 1_200_000 -(rounding)-> 1_000_000
    assert.equal(settings.attributes.defaultInitialCreditLimit, 1000000)
  })

  await it('superadmin creates a currency and its administrator account', async () => {
    const currency = currencyPostBody({code: "TES3"}, "3", {})
    const currencyResponse = await t.api.post('/currencies', currency, superadmin)
    assert.equal(currencyResponse.body.data.attributes.code, 'TES3')
    assert.equal(currencyResponse.body.data.relationships.admins.data[0].id, testUserId("3"))

    const accountResponse = await t.api.post('/TES3/accounts', {
      data: {
        type: "accounts",
        attributes: {
          code: "TES30000"
        },
        relationships: {
          users: {
            data: [{ type: "users", id: testUserId("3") }]
          }
        }
      },
      included: [{ type: "users", id: testUserId("3") }]
    }, superadmin)

    assert.equal(accountResponse.body.data.attributes.code, 'TES30000')
    assert.equal(accountResponse.body.data.attributes.status, 'active')
    assert.equal(accountResponse.body.data.attributes.balance, 0)
    assert.equal(accountResponse.body.data.attributes.creditLimit, 1000)
  })

  await it('superadmin currency creation requires an explicit administrator', async () => {
    const currency: any = currencyPostBody({code: "TES4"}, "4", {})
    delete currency.data.relationships.admins
    currency.included = currency.included.filter(({ type }: { type: string }) => type !== "users")

    const response = await t.api.post('/currencies', currency, superadmin, 400)
    assert.equal(response.body.errors[0].detail, 'Admin user must be provided explicitly or as logged in user')
  })

  await it('repeated code', async () => badPost({code: "TES1"}))
  await it('incorrect code', async () => badPost({code: "EUR", rate: undefined}))
  await it('missing rate', async () => badPost({code: "ERRO", rate: undefined}))
  await it('incorrect div by zero rate', async () => badPost({code: "ERRO", rate: {n: 1, d: 0}}))
  await it('incorrect zero rate', async () => badPost({code: "ERRO", rate: {n: 0, d: 1}}))
  await it('incorrect negative rate', async () => badPost({code: "ERRO", rate: {n: -1, d: 1}}))
  
  // Only logged-in users with accounting:write can create currencies.
  await it('unauthorized create', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), undefined, 401)
  })
  await it('missing scope create', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), {user: "400", scopes: []}, 403)
  })
  await it('read-only scope cannot create', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), userAuth("400", [Scope.AccountingRead]), 403)
  })
  await it('legacy audience is rejected', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), {
      ...userAuth("400", [Scope.AccountingWrite]),
      audience: "komunitin-app",
    }, 401)
  })
  await it('legacy issuer prefix is rejected', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), {
      ...userAuth("400", [Scope.AccountingWrite]),
      issuer: `${config.AUTH_JWT_ISSUER}/en`,
    }, 401)
  })
  await it('legacy accounting scope is rejected', async () => {
    await t.api.post('/currencies', currencyPostBody({code: "ERRO"}, "400", {}), {
      ...userAuth("400"),
      scopes: ["accounting"],
    }, 403)
  })

  // public endpoint
  await it('list currencies', async () => {
    const response = await t.api.get('/currencies')
    assert(Array.isArray(response.body.data))
    assert.equal(response.body.data.length,3)
    assert.equal(response.body.data[0].attributes.code, 'TES1')
    assert.equal(response.body.data[1].attributes.code, 'TES2')
    assert.equal(response.body.data[2].attributes.code, 'TES3')
  })
  
  // public endpoint
  await it('get currency', async () => {
    const response = await t.api.get('/TES1/currency')
    assert.equal(response.body.data.attributes.code, 'TES1')
  })
  
  await it('not found currency', async () => {
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
  await it('can update currency settings', async () => {
    const response = await t.api.patch('/TES2/currency/settings', {data: {
      attributes: {
        defaultInitialCreditLimit: 2000
      }
    }}, admin2)
    assert.equal(response.body.data.attributes.defaultInitialCreditLimit, 2000)
  })
  
  await it('can update all currency settings', async () => {
    const response = await t.api.patch('/TES2/currency/settings', {data: {
      attributes: {
        defaultInitialCreditLimit: 2500,
        defaultInitialMaximumBalance: false,
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
        defaultOnPaymentCreditLimit: false,
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

  await it.todo('can update external trader settings', async () => {
    const response = await t.api.patch('/TES2/currency/settings', {data: {
      attributes: {
        externalTraderCreditLimit: 25000,
        externalTraderMaximumBalance: 25000
      }
    }}, admin2)
    assert.equal(response.body.data.attributes.externalTraderCreditLimit, 25000)
    assert.equal(response.body.data.attributes.externalTraderMaximumBalance, 25000)
  })

  await it('currency code cant be updated', async () => {
    await t.api.patch('/TES2/currency', {data: { attributes: { code: "ERRO" } }}, admin2, 400)
  })
  await it('curency id cant be updated', async () => {
    await t.api.patch('/TES2/currency', {data: { id: "change-id" }}, admin2, 400)
  })
  await it('forbidden update', async () => {
    await t.api.patch('/TES2/currency', {data: { attributes: { name: "Error" } }}, admin1, 403)
    await t.api.patch('/TES2/currency/settings', {data: { attributes: { defaultInitialCreditLimit: 1234 } }}, admin1, 403)
  })
  await it('unauthenticated update', async () => {
    await t.api.patch('/TES2/currency', {data: { attributes: { name: "Error" } }}, undefined, 401)
    await t.api.patch('/TES2/currency/settings', {data: { attributes: { defaultInitialCreditLimit: 1234 } }}, undefined, 401)
  })

})
