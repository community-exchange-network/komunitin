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

  it.todo("balances are hidden even if accounts are included from a transfer", async () => {
    // This test should check that balances are hidden even if accounts are included in a transfer response.
    // It requires a transfer to be created and then fetched with account details.
    // The test should ensure that the balance of the other account is not visible.
  })
})