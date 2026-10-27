import assert from "node:assert"
import { before, describe, it } from "node:test"
import { testTransfer } from "./api.data"
import { setupServerTest } from "./setup"

describe('Tag payment permission', () => {
  const t = setupServerTest()
  const value = 'retained-tag-1234567890'

  before(async () => {
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: { attributes: { allowTagPayments: true, tags: [{ name: 'Retained tag', value }] } }
    }, t.admin)
    await t.api.patch(`/TEST/accounts/${t.account2.id}/settings`, {
      data: { attributes: { allowTagPaymentRequests: true } }
    }, t.admin)
  })

  const request = (state: string) => {
    const data = testTransfer(t.account1.id, t.account2.id, 10, 'Tag request', state)
    Object.assign(data.data.attributes, { authorization: { type: 'tag', value } })
    return data
  }

  it('revokes both new charges and previously created requests without deleting tags', async () => {
    const saved = await t.api.post('/TEST/transfers', request('new'), t.user2)
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: { attributes: { allowTagPayments: false } }
    }, t.admin)
    await t.api.post('/TEST/transfers', request('committed'), t.user2, 403)
    await t.api.patch(`/TEST/transfers/${saved.body.data.id}`, {
      data: { attributes: { state: 'committed' } }
    }, t.user2, 403)
    const account = await t.api.get(`/TEST/accounts/${t.account1.id}?include=settings`, t.user1)
    assert.equal(account.body.data.attributes.balance, 0)
    assert.equal(account.body.included.find((item: any) => item.type === 'account-settings').attributes.tags.length, 1)
  })

  it('respects account overrides and currency defaults', async () => {
    for (const [defaultAllowTagPayments, allowTagPayments, allowed] of [
      [true, false, false], [false, null, false], [true, null, true], [false, true, true]
    ]) {
      await t.api.patch('/TEST/currency/settings', {
        data: { attributes: { defaultAllowTagPayments } }
      }, t.admin)
      await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
        data: { attributes: { allowTagPayments } }
      }, t.admin)
      const response = await t.api.post('/TEST/transfers', request('committed'), t.user2, allowed ? 201 : 403)
      if (allowed) assert.equal(response.body.data.attributes.state, 'committed')
    }
  })
})
