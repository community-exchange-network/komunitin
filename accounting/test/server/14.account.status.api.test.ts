import { describe, it } from "node:test"
import assert from "node:assert"

import { setupServerTest } from './setup'

describe('Account status', async () => {
  const t = setupServerTest()

  it('should return account status', async () => {
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('user can disable its own account', async () => {
    const response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`, 
      { data: { attributes: { status: 'disabled' } } },
      t.user1
    )
    assert.equal(response.body.data.attributes.status, 'disabled')
  })

  it('cannot trade with disabled accounts', async () => {
    await t.payment(t.account2.id, t.account1.id, 10, "Test payment to disabled account", "committed", t.user2, 403)
    await t.payment(t.account1.id, t.account2.id, 10, "Test payment from disabled account", "committed", t.user1, 403)
  })

  it('disabled account is not listed to other users', async () => {
    const response = await t.api.get(`/TEST/accounts`, t.user2)
    const accounts = response.body.data as any[]
    accounts.forEach(a => {
      assert.notEqual(a.id, t.account1.id)
      assert.equal(a.attributes.status, "active")
    })
  })

  it('disabled account can be re-enabled by user', async () => {
    const response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'active' } } },
      t.user1
    )
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('account can be disabled/enabled by admin', async () => {
    let response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'disabled' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'disabled')

    response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'active' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('user can\'t suspend accounts', async () => {
    // user can't suspend its own account
    await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'suspended' } } },
      t.user1,
      403
    )

    // nor other accounts
    await t.api.patch(
      `/TEST/accounts/${t.account2.id}`,
      { data: { attributes: { status: 'suspended' } } },
      t.user1,
      403
    )
  })
  
  it('admin can suspend accounts', async () => {
    const response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'suspended' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'suspended')

    // cannot trade with suspended account
    await t.payment(t.account2.id, t.account1.id, 10, "Test payment to suspended account", "committed", t.user2, 403)
    await t.payment(t.account1.id, t.account2.id, 10, "Test payment from suspended account", "committed", t.user1, 403)
  })

  it('user cannot re-enable or disable suspended account', async () => {
    // but user cannot re-enable it
    await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'active' } } },
      t.user1,
      403
    )

    // nor convert to disabled
    await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'disabled' } } },
      t.user1,
      403
    )
  })

  it('suspended account is not listed to other users', async () => {
    
    // and it's not listed to other users
    const response = await t.api.get(`/TEST/accounts`, t.user2)
    const accounts = response.body.data as any[]
    accounts.forEach(a => {
      assert.notEqual(a.id, t.account1.id)
    })
  })

  it('admin can re-enable or disable suspended account', async () => {
    // but admin can convert to disabled
    let response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'disabled' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'disabled')

    // and back to suspended
    response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'suspended' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'suspended')

    // and finally back to active
    response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'active' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'active')

    // can trade again
    await t.payment(t.account2.id, t.account1.id, 10, "Test payment to re-enabled account", "committed", t.user2)
    await t.payment(t.account1.id, t.account2.id, 10, "Test payment from re-enabled account", "committed", t.user1)
  })
})