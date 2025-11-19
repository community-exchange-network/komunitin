import { describe, it } from "node:test"
import assert from "node:assert"
import { setupServerTest } from "./setup"
import { waitFor } from "./utils"
import { BaseControllerImpl } from "src/controller/base-controller"
import { sleep } from "src/utils/sleep"

describe("OnPayment credit limit", async () => {
  const t = setupServerTest()

  await it('cant set arbitrary currency options', async () => {
    await t.api.patch(`/TEST/currency`, {
      data: {
        attributes: {
          invalid: 123
        }
      }
    }, t.admin, 400)
  })

  await it('admin enable on-payment credit limit', async () => {
    const response = await t.api.patch('/TEST/currency/settings', {
      data: {
        attributes: {
          defaultOnPaymentCreditLimit: 1300
        }
      }
    }, t.admin)
    assert.equal(response.body.data.type, "currency-settings")
    assert.equal(response.body.data.attributes.defaultOnPaymentCreditLimit, 1300)
    assert.equal(response.body.data.attributes.defaultInitialCreditLimit, 1000)
  })

  await it('user increases credit limit after payment', async () => {
    await t.payment(t.account1.id, t.account2.id, 200, "Increase credit", "committed", t.user1)

    await waitFor(async () => {
      const a2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data

      return a2.attributes.balance === 200 &&
            a2.attributes.creditLimit === 1200
    }, "Credit limit updated after payment", 15000, 500)

    const a1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user2)).body.data
    assert.equal(a1.attributes.balance, -200)
    assert.equal(a1.attributes.creditLimit, 1000)
  })

  await it('user can indeed use credit limit', async () => {
    await t.payment(t.account2.id, t.account1.id, 1400, "Use credit", "committed", t.user2)

    await waitFor(async () => {
      const a1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user2)).body.data

      return a1.attributes.balance === 1200 &&
            a1.attributes.creditLimit === 1300
    }, "Credit limit updated to max", 15000, 500)

    const a2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    
    assert.equal(a2.attributes.balance, -1200)
    assert.equal(a2.attributes.creditLimit, 1200)

  })

  await it('accept payment request from whitelisted accounts', async () => {
    // Account 0 accept payments from account 1.
    const response = await t.api.patch(`/TEST/accounts/${t.account0.id}/settings`, {
      data: {
        attributes: {
          acceptPaymentsWhitelist: [t.account1.id]
        }
      }
    }, t.admin)
    assert.deepEqual(response.body.data.attributes.acceptPaymentsWhitelist, [t.account1.id])

    const transfer = await t.payment(t.account0.id, t.account1.id, 300, "Whitelisted", "committed", t.user1)
    assert.equal(transfer.attributes.amount, 300)
    assert.equal(transfer.attributes.state, "committed")

  })


  await it('set tranfers to be updated after a tiny while', async () => {
    const res = await t.api.patch(`/TEST/currency/settings`, {	
      data: {	
        attributes: {	
          defaultAcceptPaymentsAfter: 1	 // seconds
        }
      }	
    }, t.admin)
    assert.equal(res.body.data.attributes.defaultAcceptPaymentsAfter, 1)
    // payment request
    const transfer = await t.payment(t.account1.id, t.account2.id, 100, "Use credit", "committed", t.user2)
    assert.equal(transfer.attributes.state, "pending")
    // wait 1 second and run cron
    await sleep(1000)
    await (t.app.komunitin.service as BaseControllerImpl).cron()
    // check transfer has been committed.
    const updated = await t.api.get(`/TEST/transfers/${transfer.id}`, t.user2)
    assert.equal(updated.body.data.attributes.state, "committed")
  })

  await it('cant set arbitrary currency options', async () => {
    await t.api.patch(`/TEST/currency/settings`, {
      data: {
        attributes: {
          invalid: 123
        }
      }
    }, t.admin, 400)
  })

  await it('allow payments setting', async() => {
    const s1 = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          allowPayments: false,
          allowPaymentRequests: true
        }
      }
    }, t.admin)
    assert.equal(s1.body.data.attributes.allowPayments, false)
    assert.equal(s1.body.data.attributes.allowPaymentRequests, true)
    
    await t.payment(t.account1.id, t.account2.id, 10, "Cant pay", "committed", t.user1, 403)
    const t1 = await t.payment(t.account2.id, t.account1.id, 10, "Can request", "committed", t.user1)
    assert.equal(t1.attributes.state, "pending")   

  })

  await it('allow payment requests setting', async() => {
    const s1 = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          allowPayments: true,
          allowPaymentRequests: false
        }
      }
    }, t.admin)
    assert.equal(s1.body.data.attributes.allowPayments, true)
    assert.equal(s1.body.data.attributes.allowPaymentRequests, false)

    const t1 = await t.payment(t.account1.id, t.account2.id, 10, "Can pay", "committed", t.user1)
    assert.equal(t1.attributes.state, "committed")
    await t.payment(t.account2.id, t.account1.id, 10, "Cant request", "committed", t.user1, 403)
  })

  await it('set setting to group default', async() => {
    const s1 = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          allowPayments: null,
          allowPaymentRequests: null
        }
      }
    }, t.admin)
    assert.equal(s1.body.data.attributes.allowPayments, undefined)
    assert.equal(s1.body.data.attributes.allowPaymentRequests, undefined)
  })

})