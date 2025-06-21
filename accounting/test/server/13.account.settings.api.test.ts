import { describe, it } from "node:test"
import assert from "node:assert"

import { setupServerTest } from './setup'

describe('Account settings', async () => {
  const t = setupServerTest()
  const hasBalance = (account: any) => assert.ok(account.attributes.balance !== undefined, "Account should have a balance")
  const doesNotHaveBalance = (account: any) => assert.strictEqual(account.attributes.balance, undefined, "Account should not have a balance")

  it('hide account balance by default', async () => {
    // check how users can see balances before updating the setting
    const responseBefore = await t.api.get('/TEST/accounts', t.user2)
    assert.equal(responseBefore.body.data.length, 3)
    responseBefore.body.data.forEach(hasBalance)

    // set currency defaultHideBalance to true
    await t.api.patch('/TEST/currency/settings', {
      data: {
        attributes: { defaultHideBalance: true }
      }
    }, t.admin)
    
    // check that the account balances are hidden for regular user
    const response = await t.api.get('/TEST/accounts', t.user2)
    assert.equal(response.body.data.length, 3)

    doesNotHaveBalance(response.body.data[0])
    doesNotHaveBalance(response.body.data[1])
    hasBalance(response.body.data[2]) // user2 own account

    // check that the account balances are visible for admin
    const responseAdmin = await t.api.get('/TEST/accounts', t.admin)
    assert.equal(responseAdmin.body.data.length, 3)
    responseAdmin.body.data.forEach(hasBalance)
  })

  it('user cannot hide own balance', async () => {
    await t.api.patch(`/TEST/accounts/${t.account2.id}/settings`, {
      data: { attributes: { hideBalance: true } }
    }, t.user2, 403)
  })

  it('unhide balance for selected accounts', async () => {
    // Hide balances by default
    await t.api.patch('/TEST/currency/settings', {
      data: {
        attributes: { defaultHideBalance: true }
      }
    }, t.admin)
    // Unhide balance for account0
    await t.api.patch(`/TEST/accounts/${t.account0.id}/settings`, {
      data: { attributes: { hideBalance: false } }
    }, t.admin)
    // Check that account0 balance is visible while account1 is hidden
    const response = await t.api.get('/TEST/accounts', t.user2)
    assert.equal(response.body.data.length, 3)
    hasBalance(response.body.data[0]) // account0
    doesNotHaveBalance(response.body.data[1]) // account1
    hasBalance(response.body.data[2]) // user2 own account
  })

  it("balances are hidden even if accounts are included from a transfer", async () => {
    // Create a transfer between account1 and account2
    const transfer = await t.payment(t.account2.id, t.account1.id, 100, "Transfer for balance check", "committed", t.user2)
    const res2 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)
    const res1 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user2)
    assert.equal(res2.body.data.attributes.balance, -100)
    doesNotHaveBalance(res1.body.data) // account1 balance is hidden
    // Check also account 2 balance is hidden when retrieved through transfer
    const res3 = await t.api.get(`/TEST/transfers/${transfer.id}?include=payer,payee`, t.user2)
    const included = res3.body.included
    const payer = included.find((i: any) => i.type === 'accounts' && i.id === t.account2.id)
    const payee = included.find((i: any) => i.type === 'accounts' && i.id === t.account1.id)
    assert.equal(payer.attributes.balance, -100)
    doesNotHaveBalance(payee) // account1 balance is hidden

    const res4 = await t.api.get(`/TEST/transfers?include=payer,payee`, t.user2)
    const included2 = res4.body.included
    const payer2 = included2.find((i: any) => i.type === 'accounts' && i.id === t.account2.id)
    const payee2 = included2.find((i: any) => i.type === 'accounts' && i.id === t.account1.id)
    assert.equal(payer2.attributes.balance, -100)
    doesNotHaveBalance(payee2) // account1 balance is hidden

  })
})