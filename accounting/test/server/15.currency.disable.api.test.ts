import { describe, it } from "node:test"
import assert from "node:assert"

import { setupServerTest } from './setup'
import { randomUUID } from "node:crypto"

describe('Currency disable', async () => {
  const t = setupServerTest()

  it('should return currency status', async () => {
    const response = await t.api.get(`/TEST/currency`, t.user1)
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('non-admin cannot disable currency', async () => {
    await t.api.patch(
      `/TEST/currency/${t.currency.id}`, 
      { data: { attributes: { status: 'disabled' } } },
      t.user1,
      403
    )
  })

  it('admin can disable own currency', async () => {
    const response = await t.api.patch(
      `/TEST/currency/${t.currency.id}`, 
      { data: { attributes: { status: 'disabled' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'disabled')
  })

  it('currency don\'t appear in currency list', async () => {
    const response = await t.api.get(`/currencies`)
    const codes = response.body.data.map((c: any) => c.attributes.code)
    assert.ok(!codes.includes('TEST'))
  })

  it('cannot operate with disabled currency', async () => {
    await t.payment(t.account1.id, t.account2.id, 10, "Test payment in disabled currency", "committed", t.user1, 403)
    await t.api.patch('/TEST/currency/settings', {data: {
      attributes: {
        defaultInitialCreditLimit: 1234
      }
    }}, t.admin, 403)
    await t.createAccount("noway", t.currency.code, undefined, 403)
  })

  it('disabled currency can be re-enabled by admin', async () => {
    const response = await t.api.patch(
      `/TEST/currency/${t.currency.id}`,
      { data: { attributes: { status: 'active' } } },
      t.admin
    )
    assert.equal(response.body.data.attributes.status, 'active')
  })

  it('currency appear again in currency list', async () => {
    const response = await t.api.get(`/currencies`)
    const codes = response.body.data.map((c: any) => c.attributes.code)
    assert.ok(codes.includes('TEST'))
  })
  
  it('can operate again with re-enabled currency', async () => {
    await t.payment(t.account1.id, t.account2.id, 10, "Test payment in re-enabled currency", "committed", t.user1)
  })

})