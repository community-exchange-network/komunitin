import { describe, it } from "node:test"
import { setupServerTest } from './setup'
import assert from "node:assert"
import { clearEvents, getEvents } from "./net.mock"
import { Scope } from "../../src/server/auth"
import { testAccount } from "./api.data"
import { waitFor } from "./utils"

describe("Send events to notifications service", async () => {
  const t = setupServerTest()

  let transfer: any
  await it('sends pending event', async () => {
    transfer = await t.payment(t.account1.id, t.account2.id, 100, "Test notifications", "committed", t.user2)
    assert.equal(transfer.attributes.state, "pending")
    await waitFor(async () => {
      const events = getEvents()
      return events.length === 1
    }, "Expected 1 event", 500)
    const events = getEvents()
    const atts = events[0].attributes
    assert.equal(atts.name, "TransferPending")
    assert.equal(atts.data.transfer, transfer.id)
    assert.equal(atts.data.payer, t.account1.id)
    assert.equal(atts.data.payee, t.account2.id)
  })

  await it('sends committed event', async () => {
    transfer = (await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: {
        attributes: {
          state: "committed"
        }
      }
    }, t.user1)).body.data
    assert.equal(transfer.attributes.state, "committed")
    await waitFor(async () => {
      const events = getEvents()
      return events.length === 2
    }, "Expected 2 events", 500)
    const events = getEvents()
    const atts = events[1].attributes
    assert.equal(atts.name, "TransferCommitted")
    assert.equal(atts.data.transfer, transfer.id)
    assert.equal(atts.data.payer, t.account1.id)
    assert.equal(atts.data.payee, t.account2.id)
  })

  await it('sends rejected event', async () => {
    clearEvents()
    transfer = await t.payment(t.account1.id, t.account2.id, 100, "Test notifications", "committed", t.user2)
    transfer = (await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: {
        attributes: {
          state: "rejected"
        }
      }
    }, t.user1)).body.data
    assert.equal(transfer.attributes.state, "rejected")
    await waitFor(async () => {
      const events = getEvents()
      return events.length === 2
    }, "Expected 2 events", 500)
    const events = getEvents()
    assert.equal(events[0].attributes.name, "TransferPending")
    assert.equal(events[1].attributes.name, "TransferRejected")
  })

  await it('notifications service can use api', async() => {
    const response = await t.api.get('/TEST/transfers', {
      user: null,
      scopes: [Scope.AccountingReadAll],
      audience: "komunitin-notifications"
    })
    assert.equal(response.status, 200)
    const tansfers = response.body.data
    assert.equal(tansfers.length, 2)
  })

  await it('notifications service cannot write', async() => {
    await t.api.post("/TEST/accounts", testAccount("123"), {
      user: null,
      scopes: [Scope.AccountingReadAll],
      audience: "komunitin-notifications"
    }, 403)
    await t.api.post("/TEST/accounts", testAccount(null as any as string), {
      user: null,
      scopes: [Scope.AccountingReadAll],
      audience: "komunitin-notifications"
    }, 403)
  }) 
})