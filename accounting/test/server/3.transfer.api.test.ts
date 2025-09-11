import { describe, it } from "node:test"
import assert from "node:assert"
import {  norl } from "./net.client"
import { Scope } from "src/server/auth"
import { validate as isUuid } from "uuid"
import { setupServerTest } from "./setup"


describe('Transfer endpoints', async () => {
  const t = setupServerTest()


  await it('user performs payment', async () => {
    const transfer = await t.payment(t.account1.id, t.account2.id, 100, "User transfer", "committed", t.user1)
    assert.equal(transfer.attributes.amount, 100)
    assert.equal(transfer.attributes.meta.description, "User transfer")
    assert.equal(transfer.attributes.state, "committed")
    assert.equal(transfer.relationships.payer.data.id, t.account1.id)
    assert.equal(transfer.relationships.payee.data.id, t.account2.id)
    assert(isUuid(transfer.id))
    
    // Check balances
    t.account1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(t.account1.attributes.balance, -100)
    t.account2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    assert.equal(t.account2.attributes.balance, 100)
  })

  await it('admin performs payment between users', async () => {
    const transfer = await t.payment(t.account1.id, t.account2.id, 40, "t.admin transfer", "committed", t.admin)
    assert.equal(transfer.attributes.amount, 40)
    
    // Check balances
    t.account1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(t.account1.attributes.balance, -140)
    t.account2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    assert.equal(t.account2.attributes.balance, 140)
  })

  await it("two-step payment", async () => {
    const transfer = await t.payment(t.account1.id, t.account2.id, 30, "Two-step transfer", "new", t.user1)
    assert.equal(transfer.attributes.amount, 30)
    assert.equal(transfer.attributes.state, "new")

    // balance don't change yet
    t.account1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(t.account1.attributes.balance, -140)
    t.account2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    assert.equal(t.account2.attributes.balance, 140)

    const response2 = await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: {
        attributes: {
          state: "committed"
        }
      }
    }, t.user1)
    const transfer2 = response2.body.data
    assert.equal(transfer2.attributes.state, "committed")
    assert.equal(transfer2.attributes.meta.description, "Two-step transfer")
    assert.equal(transfer2.attributes.amount, 30)

    //balance changed
    t.account1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(t.account1.attributes.balance, -170)
    t.account2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    assert.equal(t.account2.attributes.balance, 170)
  })

  await it('unauthorized payment', async () => {
    await t.payment(t.account1.id, t.account2.id, 10, "Unauthorized transfer", "committed", undefined, 401)
  })

  await it('forbidden payment', async () => {
    // user not involved
    await t.payment(t.account0.id, t.account1.id, 10, "Unauthorized transfer", "committed", t.user2, 403)
  })

  await it('invalid payments', async () => {
    // negative amount
    await t.payment(t.account1.id, t.account2.id, -10, "Invalid transfer", "committed", t.user1, 400)
    // zero amount
    await t.payment(t.account1.id, t.account2.id, 0, "Invalid transfer", "committed", t.user1, 400)
    // payer and payee are the same
    await t.payment(t.account1.id, t.account1.id, 10, "Invalid transfer", "committed", t.user1, 400)
    // payer not found
    await t.payment("12345678-1234-1234-1234-123456789012", t.account1.id, 10, "Invalid transfer", "committed", t.user1, 404)
    // payee not found
    await t.payment(t.account1.id, "12345678-1234-1234-1234-123456789012", 10, "Invalid transfer", "committed", t.user1, 404)
    // invalid state
    await t.payment(t.account1.id, t.account2.id, 10, "Invalid transfer", "invalid", t.user1, 400)
    // floating point amount
    await t.payment(t.account1.id, t.account2.id, 10.5, "Invalid transfer", "committed", t.user1, 400)
  })

  await it('insufficient funds', async () => {
    await t.payment(t.account1.id, t.account2.id, 900, "Insufficient funds", "committed", t.user1, 400)
  })

  await it('update credit limit', async () => {
    const response = await t.api.patch(`/TEST/accounts/${t.account1.id}`, {
      data: { attributes: { creditLimit: 2000 } }
    }, t.admin)
    assert.equal(response.body.data.attributes.creditLimit, 2000)
    const transfer = await t.payment(t.account1.id, t.account2.id, 900, "Sufficient funds", "committed", t.user1)
    assert.equal(transfer.attributes.amount, 900)
    assert.equal(transfer.attributes.state, "committed")
    // Check balances
    t.account1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)).body.data
    assert.equal(t.account1.attributes.balance, -1070)
    t.account2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    assert.equal(t.account2.attributes.balance, 1070)
  })

  await it('update transfer', async () => {
    const transfer = await t.payment(t.account1.id, t.account2.id, 100, "Initial transfer", "new", t.user1)
    assert.equal(transfer.attributes.amount, 100)
    assert.equal(transfer.attributes.state, "new")
    const response = await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { 
        attributes: { 
          amount: 200,
          meta: {
            description: "Updated transfer",
          }
        },
        relationships: {
          payee: { data: { type: "accounts", id: t.account0.id } }
        }
      }
    }, t.user1)
    const updatedTransfer = response.body.data
    assert.equal(updatedTransfer.attributes.amount, 200)
    assert.equal(updatedTransfer.attributes.meta.description, "Updated transfer")
    assert.equal(updatedTransfer.attributes.state, "new")
    assert.equal(updatedTransfer.relationships.payee.data.id, t.account0.id)
  })

  await it('invalid updates', async () => {
    const transfer = await t.payment(t.account1.id, t.account2.id, 100, "Initial transfer", "new", t.user1)
    // invalid amount
    await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { attributes: { amount: -100 } }
    }, t.user1, 400)
    // invalid state
    await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { attributes: { state: "invalid" } }
    }, t.user1, 400)
    // invalid payee
    await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { relationships: { payee: { data: { type: "accounts", id: "12345678-1234-1234-1234-123456789012" } } } }
    }, t.user1, 404)
    // forbidden payer change
    await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { relationships: { payer: { data: { type: "accounts", id: t.account0.id } } } }
    }, t.user1, 403)
    // forbidden update
    await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { attributes: { amount: 200 } }
    }, t.user2, 403)
    // unauthorized update
    await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { attributes: { amount: 200 } }
    }, undefined, 401)
  })

  await it('get transfer', async () => {
    const transfer = await t.payment(t.account1.id, t.account2.id, 100, "Get transfer", "new", t.user1)
    const response = await t.api.get(`/TEST/transfers/${transfer.id}`, t.user1)
    const fetchedTransfer = response.body.data
    assert.equal(fetchedTransfer.id, transfer.id)
    assert.equal(fetchedTransfer.attributes.amount, 100)
    assert.equal(fetchedTransfer.attributes.meta.description, "Get transfer")
    assert.equal(fetchedTransfer.attributes.state, "new")
    assert.equal(fetchedTransfer.relationships.payer.data.id, t.account1.id)
    assert.equal(fetchedTransfer.relationships.payee.data.id, t.account2.id)

    // unauthorized get
    await t.api.get(`/TEST/transfers/${transfer.id}`, undefined, 401)
    // allowed get by other party
    await t.api.get(`/TEST/transfers/${transfer.id}`, t.user2)
    // forbidden get by unrelated user
    await t.createAccount("4")
    await t.api.get(`/TEST/transfers/${transfer.id}`, { user: "4", scopes: [Scope.Accounting] }, 403)
  })

  await it('list transfers', async () => {
    const response = await t.api.get('/TEST/transfers?page[size]=3&sort=-created', t.user1)    
    assert.equal(response.body.data.length, 3)
    assert.equal(response.body.links.prev, null)
    assert.equal(norl(response.body.links.next), norl("/TEST/transfers?page[size]=3&sort=-created&page[after]=3"))
    const transfers = response.body.data
    // Last transfer
    assert.equal(transfers[0].attributes.meta.description, "Get transfer")
    assert.equal(transfers[0].attributes.amount, 100)
    assert.equal(transfers[0].attributes.state, "new")
    assert.equal(transfers[0].relationships.payer.data.id, t.account1.id)
    assert.equal(transfers[0].relationships.payee.data.id, t.account2.id)

    const response2 = await t.api.get(norl(response.body.links.next), t.user1)
    assert.equal(response2.body.data.length, 3)
    assert.notEqual(response2.body.data[0].id, transfers[0].id)
    assert.equal(norl(response2.body.links.prev), norl("/TEST/transfers?page[size]=3&sort=-created&page[after]=0"))
    assert.equal(norl(response2.body.links.next), norl("/TEST/transfers?page[size]=3&sort=-created&page[after]=6"))

    const response3 = await t.api.get(norl(response2.body.links.next), t.user1)
    assert.equal(response3.body.data.length, 2)
    assert.equal(norl(response3.body.links.prev), norl("/TEST/transfers?page[size]=3&sort=-created&page[after]=3"))
    assert.equal(response3.body.links.next, null)

  })

  await it('filter by date', async () => {
    // assuming previous transfers were created in quick succession, we can use their created dates to filter
    const allResponse = await t.api.get('/TEST/transfers?sort=updated', t.user1)
    const allTransfers = allResponse.body.data
    assert(allTransfers.length == 8)
    const fromDate = allTransfers[2].attributes.updated
    const toDate = allTransfers[5].attributes.updated
    
    const response = await t.api.get(`/TEST/transfers?filter[from]=${fromDate}&filter[to]=${toDate}&sort=updated`, t.user1)
    const transfers = response.body.data
    assert.equal(transfers.length, 3)
    assert.equal(transfers[0].id, allTransfers[2].id)
    assert.equal(transfers[2].id, allTransfers[4].id)
  })

  await it('filter by account', async () => {
    const response1 = await t.api.get(`/TEST/transfers?filter[account]=${t.account2.id}`, t.user1)
    assert.equal(response1.body.data.length, 7)
  })


  await it('admin can see all transfers', async () => {
    const response = await t.api.get('/TEST/transfers', t.admin)
    assert.equal(response.body.data.length, 8)
  })

  await it("admin can search transfers by description", async () => {
    const response1 = await t.api.get('/TEST/transfers?filter[search]=step', t.admin)
    assert.equal(response1.body.data.length, 1)
    assert.equal(response1.body.data[0].attributes.meta.description, "Two-step transfer")

    const response2 = await t.api.get('/TEST/transfers?filter[search]=funds', t.admin)
    assert.equal(response2.body.data.length, 2)
  })

  await it('user can search transfers by description', async () => {
    // case insensitive search
    const response1 = await t.api.get('/TEST/transfers?filter[search]=two', t.user1)
    assert.equal(response1.body.data.length, 1)
    assert.equal(response1.body.data[0].attributes.meta.description, "Two-step transfer")

    const response2 = await t.api.get('/TEST/transfers?filter[search]=transfer', t.user1)
    assert.equal(response2.body.data.length, 6)
  })
})