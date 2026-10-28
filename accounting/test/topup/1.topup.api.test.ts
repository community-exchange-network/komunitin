import { describe, it, before } from "node:test"
import assert from "node:assert"

import { setupServerTest } from '../server/setup'
import { waitFor } from "../server/utils"
import { createGate, holdNextMolliePayment, mockMollie, setMolliePaymentStatus } from "./mollie.mock"
import { addHandlers } from "../server/net.mock"
import { http, HttpResponse } from "msw"
import request from "supertest"

describe('Topup API', async () => {
  const t = setupServerTest()
  
  before(() => {
    mockMollie(t.app)
  })
    
  const topupSettings = {
    enabled: true,
    defaultAllowTopup: true,
    depositCurrency: 'EUR',
    rate: { n: 100, d: 1 },  // 1=1
    minAmount: 1000, // 10 €
    maxAmount: 30000, // 300 €
    paymentProvider: 'mollie',
    mollieApiKey: 'test_key_from_settings'
  }

  const createTopup = async ({ depositAmount = 1000, depositCurrency = 'EUR', accountId = t.account1.id } = {}, expectedStatus = 201) => {
    const response = await t.api.post('/TEST/topups', {
      data: {
        attributes: { depositAmount, depositCurrency },
        relationships: { account: { data: { type: 'accounts', id: accountId } } }
      }
    }, t.user1, expectedStatus)
    return response.body.data
  }

  const createPendingTopup = async (depositAmount = 1000) => {
    const topup = await createTopup({ depositAmount })
    const pending = await t.api.patch(`/TEST/topups/${topup.id}`, {
      data: { attributes: { status: 'pending' } }
    }, t.user1)
    return pending.body.data
  }

  const webhook = (topup: any) => request(t.app)
    .post(`/TEST/topups/${topup.id}/hooks/mollie`)
    .type('form')
    .send({ id: topup.attributes.paymentData.paymentId })
    .expect(200)

  const waitForStatus = async (id: string, status: string) => {
    await waitFor(async () => {
      const response = await t.api.get(`/TEST/topups/${id}`, t.user1)
      return response.body.data.attributes.status === status
    }, `Topup did not reach ${status}`, 15000)
  }

  const accountBalance = async () => {
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)
    return response.body.data.attributes.balance
  }

  const assertSingleCredit = async (topup: any, balance: number) => {
    await waitForStatus(topup.id, 'transfer_completed')
    const response = await t.api.get(`/TEST/transfers?filter[search]=Topup%20%23${topup.id}`, t.user1)
    assert.equal(response.body.data.length, 1)
    assert.equal(response.body.data[0].attributes.state, 'committed')
    assert.equal(response.body.data[0].attributes.amount, topup.attributes.receiveAmount)
    assert.equal(await accountBalance(), balance + topup.attributes.receiveAmount)
  }

  it('topups are disabled by default', async () => {
    await createTopup({}, 403)
  })

  it('admin cannot enable topups', async () => {
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: topupSettings
      }
    }, t.admin, 403)
  })

  it('superadmin can enable topups', async () => {
    const response = await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: topupSettings
      }
    }, t.superadmin)
    assert.equal(response.status, 200)
    assert.equal(response.body.data.attributes.enabled, true)
    assert.equal(response.body.data.attributes.mollieApiKey, undefined)
  })

  it('currency settings never expose payment provider credentials', async () => {
    const response = await t.api.get('/TEST/currency?include=settings')
    const settings = response.body.included.find((resource: any) => resource.type === 'currency-settings').attributes
    assert.equal(settings.defaultAllowPayments, true)
    assert.equal(settings.topup, undefined)
    assert.ok(!JSON.stringify(response.body).includes(topupSettings.mollieApiKey))
  })

  it('dedicated topup settings retain public fields without credentials', async () => {
    const response = await t.api.get('/TEST/currency/topup-settings', t.user1)
    const attributes = response.body.data.attributes
    const { mollieApiKey, ...publicSettings } = topupSettings
    assert.ok(attributes.sourceAccountId)
    assert.deepEqual(attributes, { ...publicSettings, sourceAccountId: attributes.sourceAccountId })
    assert.ok(!JSON.stringify(response.body).includes(mollieApiKey))
  })

  it('user can create a topup for their own account', async () => {
    const topup = await createTopup()
    assert.equal(topup.type, 'topups')
    assert.equal(topup.attributes.depositAmount, 1000)
    assert.equal(topup.attributes.depositCurrency, 'EUR')
    assert.equal(topup.attributes.receiveAmount, 100000)
    assert.equal(topup.attributes.status, 'new')
    assert.equal(topup.attributes.paymentProvider, 'mollie')
    assert.ok(topup.id)
  })

  it('user cannot create topup for another user account', async () => {
    await createTopup({ accountId: t.account2.id }, 403)
  })

  it('topup validates minimum amount', async () => {
    await createTopup({ depositAmount: 50 }, 403)
  })

  it('topup validates maximum amount', async () => {
    await createTopup({ depositAmount: 35000 }, 403)
  })

  it('topup validates deposit currency', async () => {
    await createTopup({ depositCurrency: 'USD' }, 403)
  })

  it('topup applies rate conversion correctly', async () => {
    // Set rate to 15:11=1.3636...
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: {
          defaultAllowTopup: true,
          enabled: true,
          depositCurrency: 'EUR',
          rate: { n: 1500, d: 11 },
          minAmount: 1000,
          maxAmount: 30000,
          paymentProvider: 'mollie'
        }
      }
    }, t.admin)

    const topup = await createTopup({ depositAmount: 1200 })
    assert.equal(topup.attributes.depositAmount, 1200)
    assert.equal(topup.attributes.receiveAmount, 163636) // 1200 * 1500 / 11 = 163636.36 -> floored to 163636
  })

  it('user can retrieve their own topup', async () => {
    const { id: topupId } = await createTopup({ depositAmount: 5000 })

    const getResponse = await t.api.get(`/TEST/topups/${topupId}`, t.user1)
    assert.equal(getResponse.status, 200)
    assert.equal(getResponse.body.data.id, topupId)
    assert.equal(getResponse.body.data.attributes.depositAmount, 5000)
    assert.equal(getResponse.body.data.attributes.status, 'new')
  })

  it('user cannot retrieve another user topup', async () => {
    const { id: topupId } = await createTopup({ depositAmount: 5000 })

    await t.api.get(`/TEST/topups/${topupId}`, t.user2, 403)
  })

  it('topup respects account allowTopup setting', async () => {
    // Disable topup for account1
    await t.api.patch(`/TEST/accounts/${t.account1.id}/topup-settings`, {
      data: {
        attributes: {
          allowTopup: false
        }
      }
    }, t.admin)

    // Try to create topup
    await createTopup({}, 403)

    // Re-enable and try again
    await t.api.patch(`/TEST/accounts/${t.account1.id}/topup-settings`, {
      data: {
        attributes: {
          allowTopup: true
        }
      }
    }, t.admin)

    await createTopup()
  })

  it('topup respects currency defaultAllowTopup setting', async () => {
    // Reset account1 allowTopup to null (use default)
    await t.api.patch(`/TEST/accounts/${t.account1.id}/topup-settings`, {
      data: {
        attributes: {
          allowTopup: null
        }
      }
    }, t.admin)

    // Set defaultAllowTopup to false
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: {
          defaultAllowTopup: false
        }
      }
    }, t.admin)

    // Try to create topup - should fail
    await createTopup({}, 403)

    // Set defaultAllowTopup to true
    await t.api.patch('/TEST/currency/topup-settings', {
      data: {
        attributes: {
          defaultAllowTopup: true
        }
      }
    }, t.admin)

    // Try again - should succeed
    await createTopup()
  })

  it('execute topup', async () => {
    const topup = await createPendingTopup(5000)
    const balance = await accountBalance()
    const checkoutUrl = topup.attributes.paymentData.checkoutUrl
    assert.ok(checkoutUrl)

    // Simulate user completing payment by visiting checkout URL
    const res = await fetch(checkoutUrl) // this is a mocked URL handled by mollie mock
    assert.equal(res.status, 200)
    const resHtml = await res.text()
    assert.ok(resHtml.includes('Mock Mollie Checkout Page'))

    // Now check the new topup status
    const topupResponse = await t.api.get(`/TEST/topups/${topup.id}`, t.user1)
    assert.equal(topupResponse.body.data.attributes.paymentData.status, 'paid')
    assert.equal(topup.attributes.receiveAmount, Math.floor(500000*15/11))
    await assertSingleCredit(topup, balance)
  })

  it('credits the paid amount once despite concurrent callbacks, a stale response and replay', async () => {
    const topup = await createPendingTopup()
    const balance = await accountBalance()
    const payment = setMolliePaymentStatus(topup.attributes.paymentData.paymentId, 'paid')
    const paidPayment = { ...payment, amount: { ...payment.amount, value: '11.00' } }
    let arrivals = 0
    const barrier = createGate()
    const late = createGate()
    addHandlers(http.get(`https://api.mollie.com/v2/payments/${payment.id}`, async () => {
      const arrival = ++arrivals
      if (arrivals === 3) barrier.release()
      await barrier.wait
      if (arrival === 3) await late.wait
      return HttpResponse.json(arrival === 3 ? { ...payment, status: 'open' } : paidPayment)
    }))

    // All callbacks read the pending topup before any provider lookup finishes.
    const callbacks = Promise.all(Array.from({ length: 3 }, () => webhook(topup)))
    try {
      await waitForStatus(topup.id, 'transfer_completed')
    } finally {
      late.release()
    }
    await callbacks
    const completed = (await t.api.get(`/TEST/topups/${topup.id}`, t.user1)).body.data
    assert.equal(completed.attributes.status, 'transfer_completed')
    assert.equal(completed.attributes.paymentData.status, 'paid')
    assert.equal(completed.attributes.depositAmount, 1100)
    assert.equal(completed.attributes.receiveAmount, 150000)
    await webhook(topup)
    await assertSingleCredit(completed, balance)
  })

  it('credits concurrent owner retries once after a failed transfer', async () => {
    const topup = await createPendingTopup()
    const balance = await accountBalance()
    // A real account limit failure exercises the existing transfer retry path.
    await t.api.patch(`/TEST/accounts/${t.account1.id}`, {
      data: { attributes: { maximumBalance: balance + 1 } }
    }, t.admin)
    setMolliePaymentStatus(topup.attributes.paymentData.paymentId, 'paid')
    await webhook(topup)
    await waitForStatus(topup.id, 'transfer_failed')
    assert.equal(await accountBalance(), balance)
    await t.api.patch(`/TEST/accounts/${t.account1.id}`, {
      data: { attributes: { maximumBalance: balance + 100 * topup.attributes.receiveAmount } }
    }, t.admin)

    await Promise.all(Array.from({ length: 4 }, () => t.api.patch(`/TEST/topups/${topup.id}`, {
      data: { attributes: { status: 'transfer_completed' } }
    }, t.user1)))
    await webhook(topup)
    await assertSingleCredit(topup, balance)
  })

  it('does not let delayed payment creation reset a completed topup', async () => {
    const { id } = await createTopup()
    const balance = await accountBalance()
    const gate = holdNextMolliePayment()
    const delayed = t.api.patch(`/TEST/topups/${id}`, {
      data: { attributes: { status: 'pending' } }
    }, t.user1)
    await gate.received
    let topup
    try {
      topup = (await t.api.patch(`/TEST/topups/${id}`, {
        data: { attributes: { status: 'pending' } }
      }, t.user1)).body.data
      setMolliePaymentStatus(topup.attributes.paymentData.paymentId, 'paid')
      await webhook(topup)
      await waitForStatus(id, 'transfer_completed')
    } finally {
      gate.release()
    }
    await delayed
    const completed = (await t.api.get(`/TEST/topups/${id}`, t.user1)).body.data
    assert.equal(completed.attributes.status, 'transfer_completed')
    assert.equal(completed.attributes.paymentData.paymentId, topup.attributes.paymentData.paymentId)
    await webhook(topup)
    await assertSingleCredit(topup, balance)
  })
})
