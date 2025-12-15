import assert from "node:assert"
import { after, before, describe, it } from "node:test"
import { config } from "src/config"
import { CurrencyControllerImpl } from "src/controller/currency-controller"
import { EventName } from "src/controller/features/notificatons"
import { logger } from "src/utils/logger"
import { BaseControllerImpl } from "../../src/controller/base-controller"
import { CurrencySettings } from "../../src/model"
import { testCurrency, testTransfer, userAuth } from "./api.data"
import { clearEvents, getEvents } from "./net.mock"
import { setupServerTest } from './setup'
import { waitFor } from "./utils"

describe("External transfers", async () => {
  const t = setupServerTest()
  before(() => {
    logger.level = "debug"
  })
  after(() => {
    logger.level = "info"
  })
  
  const eAdmin = userAuth("10")
  const eUser1 = userAuth("11")
  
  let eCurrency: any
  let eAccount1: any
  let eTrustline: any

  const externalTransfer = async (currency: any, externalCurrency: any, payer: any, payee: any, amount: number, description: string, state: string, auth: any, httpStatus = 201) => {
    const transfer = testTransfer(payer.id, payee.id, amount, description, state)
    if (payer.relationships.currency.data.id !== currency.id) {
      (transfer.data.relationships.payer.data as any).meta = { 
        external: true, 
        href: `${config.API_BASE_URL}/${externalCurrency.attributes.code}/accounts/${payer.id}` 
      }
    }
    if (payee.relationships.currency.data.id !== currency.id) {
      (transfer.data.relationships.payee.data as any).meta = {
        external: true, 
        href: `${config.API_BASE_URL}/${externalCurrency.attributes.code}/accounts/${payee.id}` 
      }
    }
    const response = await t.api.post(`/${currency.attributes.code}/transfers`, transfer, auth, httpStatus)
    return response.ok ? response.body.data : response.body
  }

  const reconcileExternalState = async (code: string) => {
    const service = t.app.komunitin.service as BaseControllerImpl
    const currency = await service.getCurrencyController(code)
    await currency.reconcileExternalState()
  }
  
  before(async () => {
    // Create secondary currency
    const response = await t.api.post('/currencies', testCurrency({
      code: "EXTR",
      rate: {
        n: 1,
        d: 2
      }
    }), eAdmin)
    eCurrency = response.body.data
    // Create account in EXTR for user1
    eAccount1 = await t.createAccount(eUser1.user, "EXTR", eAdmin)
  })

  await it('unsuccesful external transfer - no trust', async () => {
    await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, 100, "TEST => EXTR", "committed", t.user1, 400)
    await externalTransfer(eCurrency, t.currency, eAccount1, t.account1, 100, "EXTR => TEST", "committed", eUser1, 400)
  })

  /**
   * Creates a new trustline from currency to trustedCurrency, enabling payments from trustedCurrency to currency.
   * Remember to call waitForPath() after this to ensure paths are available.
   * @returns 
   */
  const trustCurrency = async (currency: any, trustedCurrency: any, limit: number, auth: any) => {
    const srcCode = trustedCurrency.attributes.code
    const destCode = currency.attributes.code
    
    const response = await t.api.post(`/${destCode}/trustlines`, {
      data: {
        attributes: {
          limit
        },
        relationships: {
          trusted: {
            data: {
              type: "currencies",
              id: trustedCurrency.id,
              meta: {
                external: true,
                href: `${config.API_BASE_URL}/${srcCode}/currency`
              }
            }
          }
        }
      }
    }, auth)    
    return response.body.data
  }

  /**
   * amount in source currency
   */
  const waitForPath = async (fromCurrency: any, toCurrency: any, amount: number) => {
    const controller = await t.app.komunitin.service.getCurrencyController(fromCurrency.attributes.code) as CurrencyControllerImpl
    const destAmount = (amount / 10 ** toCurrency.attributes.scale).toFixed(7)
    
    const path = await controller.ledger.quotePath({
      destCode: toCurrency.attributes.code,
      destIssuer: toCurrency.attributes.keys.issuer,
      amount: destAmount,
      retry: true
    })

    assert.ok(path, `Path not found from ${fromCurrency.attributes.code} to ${toCurrency.attributes.code}`)
  }

  await it('set trust to currency', async () => {
    // EXTR trusts TEST
    eTrustline = await trustCurrency(eCurrency, t.currency, 1000, eAdmin)
    await waitForPath(t.currency, eCurrency, 1000)

    assert.equal(eTrustline.attributes.limit, 1000)
    assert.equal(eTrustline.attributes.balance, 0)

    assert.equal(eTrustline.relationships.currency.data.id, eCurrency.id)

    assert.equal(eTrustline.relationships.trusted.data.id, t.currency.id)
    assert.strictEqual(eTrustline.relationships.trusted.data.meta.external, true)
  })
  
  await it('get trustline', async () => {
    const trustline = (await t.api.get(`/EXTR/trustlines/${eTrustline.id}`, eUser1)).body.data

    assert.equal(trustline.id, eTrustline.id)
    assert.equal(trustline.attributes.limit, 1000)
    assert.equal(trustline.attributes.balance, 0)
    assert.equal(trustline.relationships.currency.data.id, eCurrency.id)
    assert.equal(trustline.relationships.trusted.data.id, t.currency.id)
    assert.strictEqual(trustline.relationships.trusted.data.meta.external, true)
    assert.strictEqual(trustline.relationships.trusted.data.meta.href, eTrustline.relationships.trusted.data.meta.href)
  })
  

  await it('list trustlines', async () => {
    const trustlines = (await t.api.get(`/EXTR/trustlines`, eUser1)).body.data
    assert.equal(trustlines.length, 1)
    assert.equal(trustlines[0].id, eTrustline.id)
  })
  
  await it('successful external payment', async () => {
    // 100 TEST = 10 HOUR = 20 EXTR
    const transfer = await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, 100, "TEST => EXTR", "committed", t.user1)

    const checkTransfer = (transfer: any, test: boolean) => {
      assert.equal(transfer.attributes.amount, test ? 100 : 20)
      assert.equal(transfer.attributes.meta.description, "TEST => EXTR")
      assert.equal(transfer.attributes.state, "committed")
      assert.equal(transfer.relationships.payer.data.id, t.account1.id)
      assert.equal(transfer.relationships.payee.data.id, eAccount1.id)
      if (test) {
        assert.strictEqual(transfer.relationships.payer.data.meta, undefined)
        assert.strictEqual(transfer.relationships.payee.data.meta.external, true)    
      } else {
        assert.strictEqual(transfer.relationships.payer.data.meta.external, true)
        assert.strictEqual(transfer.relationships.payee.data.meta, undefined)  
      }
    }
    checkTransfer(transfer, true)

    // Check balances
    const a1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(a1.attributes.balance, -100)
    const e1 = (await t.api.get(`/EXTR/accounts/${eAccount1.id}`, eUser1)).body.data
    assert.equal(e1.attributes.balance, 20)

    // Check transfer from EXTR point of view (list)
    const transfers = (await t.api.get(`/EXTR/transfers?sort=-created`, eUser1)).body.data
    checkTransfer(transfers[0], false)

    // Check transfer from EXTR point of view (get)
    const transfer1 = (await t.api.get('/EXTR/transfers/' + transfers[0].id, eUser1)).body.data
    checkTransfer(transfer1, false)

    // Check transfer from TEST point of view (list)
    const transfers2 = (await t.api.get(`/TEST/transfers?sort=-created`, t.user1)).body.data
    checkTransfer(transfers2[0], true)

    // Check transfer from TEST point of view (get)
    const transfer2 = (await t.api.get('/TEST/transfers/' + transfers2[0].id, t.user1)).body.data
    checkTransfer(transfer2, true)

  })

  await it.todo("trustline balance", async () => {
    const trustline = (await t.api.get(`/EXTR/trustlines/${eTrustline.id}`, eUser1)).body.data
    assert.equal(trustline.attributes.balance, 20)
  })

  await it('successful external payment request (immediate)', async () => {
    // Enable external payment requests in both currencies
    await t.api.patch(`/TEST/currency/settings`, { data: { attributes: { 
      enableExternalPaymentRequests: true,
      defaultAllowExternalPaymentRequests: true, 
      defaultAcceptExternalPaymentsAutomatically: true 
    } } }, t.admin)
    await t.api.patch(`/EXTR/currency/settings`, { data: { attributes: { 
      enableExternalPaymentRequests: true,
      defaultAllowExternalPaymentRequests: true, 
    } } }, eAdmin)

    // EXTR <= TEST
    const transfer = await externalTransfer(eCurrency, t.currency, t.account1, eAccount1, 20, "EXTR <= TEST", "committed", eUser1)
    // Check balances
    const a1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(a1.attributes.balance, -200)
    const e1 = (await t.api.get(`/EXTR/accounts/${eAccount1.id}`, eUser1)).body.data
    assert.equal(e1.attributes.balance, 40)
    // Check transfers
    const transfer1 = (await t.api.get('/EXTR/transfers/' + transfer.id, eUser1)).body.data
    assert.equal(transfer1.attributes.state, "committed")
    assert.equal(transfer1.attributes.amount, 20)
    assert.strictEqual(transfer.relationships.payer.data.meta.external, true)
    
    // Include external resource.
    const response = (await t.api.get(`/TEST/transfers/${transfer.id}?include=payee`, t.user1)).body
    const transfer2 = response.data
    assert.equal(transfer2.attributes.state, "committed")
    assert.equal(transfer2.attributes.amount, 100)
    assert.strictEqual(transfer2.relationships.payee.data.meta.external, true)
    // Check included resource
    assert.equal(response.included.length, 1)
    assert.equal(response.included[0].id, transfer2.relationships.payee.data.id)
  })

  await it('succesful external payment request (approval)', async () => {
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, { data: { attributes: { 
      acceptExternalPaymentsAutomatically: false
    }}}, t.user1)
    // Create request EXTR <= TEST
    const transfer = await externalTransfer(eCurrency, t.currency, t.account1, eAccount1, 20, "EXTR <= TEST", "committed", eUser1)
    assert.equal(transfer.attributes.state, "pending")
    
    // Check transfers before approval
    const transfer1 = (await t.api.get('/EXTR/transfers/' + transfer.id, eUser1)).body.data
    assert.equal(transfer1.attributes.state, "pending")
    assert.equal(transfer1.attributes.amount, 20)
    assert.strictEqual(transfer.relationships.payer.data.meta.external, true)
    
    const transfer2 = (await t.api.get('/TEST/transfers/' + transfer.id, t.user1)).body.data
    assert.equal(transfer2.attributes.state, "pending")
    assert.equal(transfer2.attributes.amount, 100)
    assert.strictEqual(transfer2.relationships.payee.data.meta.external, true)

    // Approve request
    const approved = (await t.api.patch(`/TEST/transfers/${transfer.id}`, { data: { attributes: { state: "committed" } } }, t.user1)).body.data
    assert.equal(approved.attributes.state, "committed")

    // Check balances
    const a1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(a1.attributes.balance, -300)
    const e1 = (await t.api.get(`/EXTR/accounts/${eAccount1.id}`, eUser1)).body.data
    assert.equal(e1.attributes.balance, 60)

    // Check transfer after approval
    const approved1 = (await t.api.get('/EXTR/transfers/' + transfer.id, eUser1)).body.data
    assert.equal(approved1.attributes.state, "committed")
    
    // Check transfer after approval
    const approved2 = (await t.api.get('/TEST/transfers/' + transfer.id, t.user1)).body.data
    assert.equal(approved2.attributes.state, "committed")

  })

  await it('unsuccesful external payment request (rejected)', async () => {
    clearEvents()
    // Create request EXTR <= TEST
    const transfer = await externalTransfer(eCurrency, t.currency, t.account1, eAccount1, 20, "EXTR <= TEST", "committed", eUser1)
    assert.equal(transfer.attributes.state, "pending")
    
    let events: any[] = []
    // Check transferPending notification
    await waitFor(async () => {
      events = getEvents()
      return events.length === 2
    }, "Expected 2 events", 500)
    assert.equal(events[0].attributes.name, EventName.TransferPending)
    assert.equal(events[0].attributes.code, "TEST")
    assert.equal(events[1].attributes.name, EventName.TransferPending)
    assert.equal(events[1].attributes.code, "EXTR")
    
    clearEvents()
    const rejected = (await t.api.patch(`/TEST/transfers/${transfer.id}`, { data: { attributes: { state: "rejected" } } }, t.user1)).body.data
    assert.equal(rejected.attributes.state, "rejected")
    await waitFor(async () => {
      events = getEvents()
      return events.length === 2
    }, "Expected 2 events", 500)
    
    
    assert.equal(events[0].attributes.name, EventName.TransferRejected)
    assert.equal(events[0].attributes.code, "TEST")
    assert.equal(events[1].attributes.name, EventName.TransferRejected)
    assert.equal(events[1].attributes.code, "EXTR")

    // Check balances
    const a1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(a1.attributes.balance, -300)
    const e1 = (await t.api.get(`/EXTR/accounts/${eAccount1.id}`, eUser1)).body.data
    assert.equal(e1.attributes.balance, 60)

    // Check transfer after rejection
    const rejected1 = (await t.api.get('/EXTR/transfers/' + transfer.id, eUser1)).body.data
    assert.equal(rejected1.attributes.state, "rejected")
    
    // Check transfer after approval
    const rejected2 = (await t.api.get('/TEST/transfers/' + transfer.id, t.user1)).body.data
    assert.equal(rejected2.attributes.state, "rejected")

  })

  it("can trade without trust if in surplus", async () => {
    // The system listens to a stellar stream of external trades to update the external trader sell offers.
    // However I'm not able to make it work in the test environment, so we manually trigger the reconciliation here.
    await reconcileExternalState("EXTR")
    await reconcileExternalState("TEST")

    const externalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(externalAccount.attributes.balance, 300) // From previous tests

    await externalTransfer(eCurrency, t.currency, eAccount1, t.account1, 40, "40 EXTR => 200 TEST without trust", "committed", eUser1, 201)
    const updatedExternalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(updatedExternalAccount.attributes.balance, 100)
  })

  it("can update external maximum balance", async () => {
    // increase account1 credit limit to allow for this test to pass:
    await t.api.patch(`/TEST/accounts/${t.account1.id}`, { data: { attributes: { creditLimit: 1000000 } } }, t.admin)
    
    // decrease maximum balance to 500 TEST
    const newMaxBalance = 500
    
    // Update maximum balance
    const updatedSettings = (await t.api.patch(`/TEST/currency/settings`, { data: { attributes: {
      externalTraderMaximumBalance: newMaxBalance
    } } }, t.admin)).body.data.attributes as CurrencySettings
    assert.strictEqual(updatedSettings.externalTraderMaximumBalance, newMaxBalance)
    // Check external account status
    const externalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(externalAccount.attributes.maximumBalance, newMaxBalance)
    assert.equal(externalAccount.attributes.balance, 100) // From previous tests

    // Try unsuccessful transaction exceeding maximum balance
    const available = externalAccount.attributes.maximumBalance - externalAccount.attributes.balance // 400 TEST available to reach maximum balance
    await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, available + 100, "500 TEST => 100 EXTR exceeding maximum balance", "committed", t.user1, 400) 
    
    // Try successful transaction within new maximum balance (up to full)
    await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, available, "400 TEST => 80 EXTR within maximum balance", "committed", t.user1, 201)
    
    // Can't set the maximum balance below current balance
    await t.api.patch(`/TEST/currency/settings`, { data: { attributes: {
      externalTraderMaximumBalance: newMaxBalance - 100
    } } }, t.admin, 400)

    // But can increase it
    const updatedMaxBalance = (await t.api.patch(`/TEST/currency/settings`, { data: { attributes: {
      externalTraderMaximumBalance: 10000
    } } }, t.admin)).body.data.attributes as CurrencySettings
    assert.strictEqual(updatedMaxBalance.externalTraderMaximumBalance, 10000)
    await waitForPath(t.currency, eCurrency, 200)
    // Now transfers increasing balance should work
    await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, 1000, "1000 TEST => 200 EXTR after removing maximum balance", "committed", t.user1, 201)
    // Check external account status
    const updatedExternalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(updatedExternalAccount.attributes.balance, 1500)

    // But can't surpass the EXTR trustline (1000 EXTR = 5000 TEST)
    await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, 4000, "TEST => EXTR exceeding trustline", "committed", t.user1, 400)

  })

  it("can update external credit limit", async () => {
    // Check currency settings
    const currencySettings = (await t.api.get(`/TEST/currency/settings`, t.admin)).body.data.attributes
    assert.strictEqual(currencySettings.externalTraderCreditLimit, 1000)
    assert.strictEqual(currencySettings.externalTraderMaximumBalance, 10000)
    // Check external account status
    let externalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(externalAccount.attributes.balance, 1500) // From previous tests
    assert.equal(externalAccount.attributes.creditLimit, 1000)

    // TEST trusts EXTR
    const tTrustline = await trustCurrency(t.currency, eCurrency, 5000, t.admin)
    assert.equal(tTrustline.attributes.limit, 5000)
    assert.equal(tTrustline.attributes.balance, 0)

    // The amount is constrained by the TEST's external trader local balance 
    // of 1500 + credit limit of 1000 = 2500 TEST, not by the trustline limit of 5000 TEST.
    await waitForPath(eCurrency, t.currency, 2500)
    
    // Try successful transaction within credit limit
    await externalTransfer(eCurrency, t.currency, eAccount1, t.account1, 400, "400 EXTR => 2000 TEST within credit limit", "committed", eUser1)
    // Check external account status
    externalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(externalAccount.attributes.balance, -500) // 1500 - 2000
    // Try unsuccessful transaction exceeding credit limit
    await externalTransfer(eCurrency, t.currency, eAccount1, t.account1, 120, "120 EXTR => 600 TEST exceeding credit limit", "committed", eUser1, 400)
    
    // Update credit limit
    const updatedSettings = (await t.api.patch(`/TEST/currency/settings`, { data: { attributes: {
      externalTraderCreditLimit: 2000
    } } }, t.admin)).body.data.attributes as CurrencySettings
    assert.strictEqual(updatedSettings.externalTraderCreditLimit, 2000)

    // Check external account status
    externalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(externalAccount.attributes.balance, -500) // Balance hasn't changed
    assert.equal(externalAccount.attributes.creditLimit, 2000)

    // Now we should be able to transfer up to 1500 TEST (balance -500 + credit limit 2000)
    await waitForPath(eCurrency, t.currency, 1500)
    // Try successful transaction within new credit limit
    await externalTransfer(eCurrency, t.currency, eAccount1, t.account1, 120, "120 EXTR => 600 TEST within new credit limit", "committed", eUser1)
    // Check external account status
    externalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(externalAccount.attributes.balance, -1100)
    assert.equal(externalAccount.attributes.creditLimit, 2000)

    // Can't set the credit limit below current balance
    await t.api.patch(`/TEST/currency/settings`, { data: { attributes: {
      externalTraderCreditLimit: 1000
    } } }, t.admin, 400)

    // But can decrease it a bit
    await t.api.patch(`/TEST/currency/settings`, { data: { attributes: {
      externalTraderCreditLimit: 1500
    } } }, t.admin, 200)

  })

  it('can update currency conversion rate', async () => {
    // Make ample room for transfers
    await t.api.patch(`/TEST/currency/settings`, { data: { attributes: {
      externalTraderCreditLimit: 100000,
      externalTraderMaximumBalance: 200000
    } } }, t.admin)
    await t.api.patch(`/EXTR/currency/settings`, { data: { attributes: {
      externalTraderCreditLimit: 100000,
      externalTraderMaximumBalance: 200000
    } } }, eAdmin)
    let externalAccount = (await t.api.get(`/TEST/accounts?filter[code]=TESTEXTR`, t.admin)).body.data[0]
    assert.equal(externalAccount.attributes.creditLimit, 100000)
    assert.equal(externalAccount.attributes.maximumBalance, 200000)

    // Update conversion rate for TEST from 1/10 to 2/13
    const updatedCurrency = (await t.api.patch(`/TEST/currency`, { data: { attributes: {
      rate: { n: 2, d: 13 }
    } } }, t.admin)).body.data
    assert.equal(updatedCurrency.attributes.rate.n, 2)
    assert.equal(updatedCurrency.attributes.rate.d, 13)

    // Now 1000 TEST = 307 EXTR
    const transfer = await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, 1000, "1000 TEST => 307 EXTR after rate update", "committed", t.user1)
    assert.equal(transfer.attributes.amount, 1000)
    // Check transfer from EXTR point of view
    const eTransfer = (await t.api.get(`/EXTR/transfers/${transfer.id}`, eUser1)).body.data
    assert.equal(eTransfer.attributes.amount, 307) // Rounded down

    // And the other way around
    /*
    
    const transfer2 = await externalTransfer(eCurrency, t.currency, eAccount1, t.account1, 100, "100 EXTR => 325 TEST after rate update", "committed", eUser1)
    assert.equal(transfer2.attributes.amount, 100)
    // Check transfer from TEST point of view
    const tTransfer2 = (await t.api.get(`/TEST/transfers/${transfer2.id}`, t.user1)).body.data
    assert.equal(tTransfer2.attributes.amount, 325) // Exact
    */

  })
})