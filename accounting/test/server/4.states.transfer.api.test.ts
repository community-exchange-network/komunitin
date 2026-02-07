import { describe, it } from "node:test"
import assert from "node:assert"
import { testTransfer } from "./api.data"
import { validate as isUuid } from "uuid"
import { setupServerTest } from "./setup"

describe('Payment requests', async () => {
  const t = setupServerTest()

  it('user get account settings', async () => {
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user1)
    assert.equal(response.body.data.type, 'account-settings')
    assert(isUuid(response.body.data.id))
    assert.equal(response.body.data.attributes.acceptPaymentsAutomatically, false)
  })

  it('user set account settings', async () => {
    const response = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          acceptPaymentsAutomatically: true
        }
      }
    }, t.user1)
    assert.equal(response.body.data.type, 'account-settings')
    assert(isUuid(response.body.data.id))
    assert.equal(response.body.data.attributes.acceptPaymentsAutomatically, true)
  })

  it('unauthorized account settings', async () => {
    await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user2, 403)
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, 
      { data: { attributes: { acceptPaymentsAutomatically: false } } },
      t.user2, 403
    )
    await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, undefined, 401)
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, 
      { data: { attributes: { acceptPaymentsAutomatically: false } } },
      undefined, 401
    )
  })
  

  it('immediate payment request', async () => {
    const response = await t.api.post('/TEST/transfers', testTransfer(t.account1.id, t.account2.id, 100, "Immediate request", "committed"), t.user2)
    assert.equal(response.body.data.type, 'transfers')
    assert.equal(response.body.data.attributes.state, "committed")
    
    // check balances
    const response1 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.admin)
    assert.equal(response1.body.data.attributes.balance, -100)
    const response2 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.admin)
    assert.equal(response2.body.data.attributes.balance, 100)
  })

  let committed: {id: string}
  it ('accept payment', async() => {
    const response = await t.api.post('/TEST/transfers', testTransfer(t.account2.id, t.account1.id, 100, "Pending request", "committed"), t.user1)
    assert.equal(response.body.data.attributes.state, "pending")
    // check balances not changed
    const response1 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.admin)
    assert.equal(response1.body.data.attributes.balance, -100)
    const response2 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.admin)
    assert.equal(response2.body.data.attributes.balance, 100)
    // approve transfer by payer
    const response3 = await t.api.patch(`/TEST/transfers/${response.body.data.id}`, { data: { attributes: { state: "committed" } } }, t.user2)
    assert.equal(response3.body.data.attributes.state, "committed")
    committed = response3.body.data
    // check balances
    const response4 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.admin)
    assert.equal(response4.body.data.attributes.balance, 0)
    const response5 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.admin)
    assert.equal(response5.body.data.attributes.balance, 0)
  })

  let rejected: {id: string}
  it('reject payment', async () => {
    const response = await t.api.post('/TEST/transfers', testTransfer(t.account2.id, t.account1.id, 100, "Pending request", "committed"), t.user1)
    assert.equal(response.body.data.attributes.state, "pending")
    // reject transfer
    const response2 = await t.api.patch(`/TEST/transfers/${response.body.data.id}`, { data: { attributes: { state: "rejected" } } }, t.user2)
    assert.equal(response2.body.data.attributes.state, "rejected")
    rejected = response2.body.data
    // check balances
    const response3 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.admin)
    assert.equal(response3.body.data.attributes.balance, 0)
    const response4 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.admin)
    assert.equal(response4.body.data.attributes.balance, 0)
  })

  it ('invalid state updates', async() => {
    const response = await t.api.post('/TEST/transfers', testTransfer(t.account2.id, t.account1.id, 100, "Pending request", "new"), t.user1)
    assert.equal(response.body.data.attributes.state, "new")
    const transferId = response.body.data.id
    // Invalid state updates
    await t.api.patch(`/TEST/transfers/${transferId}`, { data: { attributes: { state: "pending" } } }, t.user1, 400)
    await t.api.patch(`/TEST/transfers/${transferId}`, { data: { attributes: { state: "submitted" } } }, t.user1, 400)
    await t.api.patch(`/TEST/transfers/${transferId}`, { data: { attributes: { state: "rejected" } } }, t.user1, 400)
    await t.api.patch(`/TEST/transfers/${committed.id}`, { data: { attributes: { state: "rejected" } } }, t.user2, 400)
    await t.api.patch(`/TEST/transfers/${rejected.id}`, { data: { attributes: { state: "committed" } } }, t.user2, 400)
  })

  it('delete transfer', async () => {
    // can't delete other's transfer. Note that rejected transfer is now "owned" by user2 since user2 is the one who rejected it.
    await t.api.delete(`/TEST/transfers/${rejected.id}`, t.user1, 403)
    // can't delete committed transfer
    await t.api.delete(`/TEST/transfers/${committed.id}`, t.user2, 400)

    // delete rejected.
    await t.api.delete(`/TEST/transfers/${rejected.id}`, t.user2)
    // delete new
    const response = await t.api.post("/TEST/transfers", testTransfer(t.account2.id, t.account1.id, 100, "Draft", "new"), t.user1)
    await t.api.delete(`/TEST/transfers/${response.body.data.id}`, t.user1)
    // delete pending
    const response2 = await t.api.post("/TEST/transfers", testTransfer(t.account2.id, t.account1.id, 100, "Pending", "new"), t.user1)
    await t.api.delete(`/TEST/transfers/${response2.body.data.id}`, t.user1)

    const result = await t.api.get(`/TEST/transfers`, t.user1)
    // Committed transfer still there
    assert(result.body.data.some((t: {id: string}) => t.id === committed.id))
    // But rejected one not there anymore.
    assert(!result.body.data.some((t: {id: string}) => t.id === rejected.id))
  })

})
