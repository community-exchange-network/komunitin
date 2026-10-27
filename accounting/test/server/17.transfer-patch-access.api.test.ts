import assert from "node:assert"
import { describe, it } from "node:test"
import { setupServerTest } from "./setup"

describe('Transfer update access', () => {
  const t = setupServerTest()

  it('protects empty and identity updates while allowing participants and administrators', async () => {
    const transfer = await t.payment(t.account0.id, t.account1.id, 10, 'Private transfer', 'committed', t.admin)
    const path = `/TEST/transfers/${transfer.id}`
    await t.api.get(path, t.user2, 403)
    for (const attributes of [{}, { state: 'committed' }, { meta: { description: 'Probe' } }]) {
      await t.api.patch(path, { data: { attributes } }, t.user2, 403)
    }
    for (const auth of [t.user1, t.admin, t.superadmin]) {
      const response = await t.api.patch(path, {
        data: { attributes: { state: 'committed' } }
      }, auth)
      assert.equal(response.body.data.id, transfer.id)
      assert.equal(response.body.data.attributes.meta.description, 'Private transfer')
    }
  })

  it('preserves an owner-created two-step payment', async () => {
    const transfer = await t.payment(t.account1.id, t.account2.id, 10, 'Two-step payment', 'new', t.user1)
    const response = await t.api.patch(`/TEST/transfers/${transfer.id}`, {
      data: { attributes: { state: 'committed' } }
    }, t.user1)
    assert.equal(response.body.data.attributes.state, 'committed')
  })
})
