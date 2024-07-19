import { describe, before, it } from "node:test"
import { setupServerTest } from './setup'
import assert from "node:assert"
import { testCurrency, testTransfer, userAuth } from "./api.data"
import { config } from "src/config"
import { logger } from "src/utils/logger"
import { LedgerCurrencyController } from "src/controller/currency-controller"

describe("External transfers", async () => {
  const t = setupServerTest()
  logger.level = "debug"
  const eAdmin = userAuth("10")
  const eUser1 = userAuth("11")
  
  let eCurrency: any
  let eAccount1: any
  let eTrustline: any

  const externalTransfer = async (currency: any, externalCurrency: any, payer: any, payee: any, amount: number, meta: string, state: string, auth: any, httpStatus = 201) => {
    const transfer = testTransfer(payer.id, payee.id, amount, meta, state)
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

  await it('set trust to currency', async () => {
    // EXTR trusts TEST
    const href = `${config.API_BASE_URL}/${t.currency.attributes.code}/currency`
    const body = {
      data: {
        attributes: {
          limit: 1000 // 1000 EXTR = 500 HOUR = 5000 TEST
        },
        relationships: {
          trusted: { 
            data: { 
              type: "currencies", 
              id: t.currency.id,
              meta: {
                external: true,
                href
              }
            }
          }
        }
      },
    }
    const response = await t.api.post(`/EXTR/trustlines`, body, eAdmin)
    eTrustline = response.body.data

    assert.equal(eTrustline.attributes.limit, 1000)
    assert.equal(eTrustline.attributes.balance, 0)

    assert.equal(eTrustline.relationships.currency.data.id, eCurrency.id)

    assert.equal(eTrustline.relationships.trusted.data.id, t.currency.id)
    assert.strictEqual(eTrustline.relationships.trusted.data.meta.external, true)
    assert.strictEqual(eTrustline.relationships.trusted.data.meta.href, href)

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
  
  await it('succesful external payment', async () => {
    // 100 TEST = 10 HOUR = 20 EXTR
    // just wait for the path to be available in the ledger.
    const controller = await t.app.komunitin.controller.getCurrencyController("TEST") as LedgerCurrencyController
    await controller.ledger.quotePath({
      destCode: "EXTR",
      destIssuer: eCurrency.attributes.keys.issuer,
      amount: "0.001",
      retry: true
    })

    const transfer = await externalTransfer(t.currency, eCurrency, t.account1, eAccount1, 100, "TEST => EXTR", "committed", t.user1)

    const checkTransfer = (transfer: any, test: boolean) => {
      assert.equal(transfer.attributes.amount, test ? 100 : 20)
      assert.equal(transfer.attributes.meta, "TEST => EXTR")
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

  await it('succesful external payment request (immediate)', async () => {
    // Enable external payment requests in both currencies
    await t.api.patch(`/TEST/currency`, { data: { attributes: { settings: { 
      enableExternalPaymentRequests: true,
      defaultAllowExternalPaymentRequests: true, 
      defaultAcceptExternalPaymentsAutomatically: true 
    } } } }, t.admin)
    await t.api.patch(`/EXTR/currency`, { data: { attributes: { settings: { 
      enableExternalPaymentRequests: true,
      defaultAllowExternalPaymentRequests: true, 
    } } } }, eAdmin)

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
    
    const transfer2 = (await t.api.get('/TEST/transfers/' + transfer.id, t.user1)).body.data
    assert.equal(transfer2.attributes.state, "committed")
    assert.equal(transfer2.attributes.amount, 100)
    assert.strictEqual(transfer2.relationships.payee.data.meta.external, true)
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


})