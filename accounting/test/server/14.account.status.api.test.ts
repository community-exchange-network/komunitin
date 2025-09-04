import { describe, it } from "node:test"
import assert from "node:assert"

import { setupServerTest } from './setup'

describe('Account status', async () => {
  const t = setupServerTest()

  it('should return account status', async () => {
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)
    assert.equal(response.status, 200)
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('user can disable its own account', async () => {
    const response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`, 
      { data: { attributes: { status: 'disabled' } } },
      t.user1
    )
    assert.equal(response.status, 200)
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
    assert.equal(response.status, 200)
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('account can be disabled/enabled by admin', async () => {
    let response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'disabled' } } },
      t.admin
    )
    assert.equal(response.status, 200)
    assert.equal(response.body.data.attributes.status, 'disabled')

    response = await t.api.patch(
      `/TEST/accounts/${t.account1.id}`,
      { data: { attributes: { status: 'active' } } },
      t.admin
    )
    assert.equal(response.status, 200)
    assert.equal(response.body.data.attributes.status, 'active')
  })
})