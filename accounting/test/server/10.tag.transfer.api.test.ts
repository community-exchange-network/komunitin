import { describe, it } from "node:test"
import assert from "node:assert"
import { validate as isUuid } from "uuid"

import { setupServerTest } from './setup'

describe('Preauthorized transfers with NFC tags', async () => {
  const t = setupServerTest()

  it('Create account tags', async () => {
    // Allow account 1 to have tags
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          allowTagPayments: true,
        }
      }
    }, t.admin)
    
    const response = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          tags: [{
            name: "Tag 1",
            value: "tag-1-1234567890",
          }, {
            name: "Tag 2",
            value: "tag-2-1234567890",
          }]
        }
      }
    }, t.user1)

    assert.equal(response.body.data.type, 'account-settings')
    assert.equal(response.body.data.attributes.allowTagPayments, true)
    assert.equal(response.body.data.attributes.tags.length, 2)
    assert.equal(response.body.data.attributes.tags[0].name, 'Tag 1')
    assert.ok(response.body.data.attributes.tags[0].updated)
    assert.ok(isUuid(response.body.data.attributes.tags[0].id))
    assert.equal(response.body.data.attributes.tags[1].name, 'Tag 2')

  })

  it('Update account tags (forbidden)', async () => {
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          tags: [{
            name: "Tag 1",
            value: "tag-1-1234567890",
          }]
        }
      }
    }, t.user2, 403)
    
  })

  it('Get account tags', async () => {
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user1)

    assert.equal(response.body.data.type, 'account-settings')
    assert.equal(response.body.data.attributes.allowTagPayments, true)
    assert.equal(response.body.data.attributes.tags.length, 2)

    assert.equal(response.body.data.attributes.tags[0].name, 'Tag 1')
    assert.ok(isUuid(response.body.data.attributes.tags[0].id))
    assert.ok(response.body.data.attributes.tags[0].updated)
    assert.equal(response.body.data.attributes.tags[0].value, undefined)
  })

  it('Get account tags (unauthorized)', async () => {
    await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user2, 403)
  })

  it('Get account by tag', async () => {
    const response = await t.api.get(`/TEST/accounts?filter[tag]=tag-1-1234567890`, t.user2)
    assert.equal(response.body.data.length, 1)
    assert.equal(response.body.data[0].id, t.account1.id)
  })

  it('Transfer with tag', async () => {
    // allow user2 to perform payment requests with tags.
    await t.api.patch(`/TEST/accounts/${t.account2.id}/settings`, {
      data: {
        attributes: {
          allowTagPaymentRequests: true,
        }
      }
    }, t.admin)

    // payment request
    const response = await t.api.post(`/TEST/transfers`, {
      data: {
        attributes: {
          amount: 100,
          meta:{
            description: 'Transfer preauthorized with tag'
          },
          state: 'committed',
          authorization: {
            type: 'tag',
            value: 'tag-1-1234567890'
          }
        },
        relationships: {
          payer: { data: { type: 'accounts', id: t.account1.id }},
          payee: { data: { type: 'accounts', id: t.account2.id }},
        }
      }
    }, t.user2)
    assert.equal(response.body.data.attributes.state, 'committed')
    assert.equal(response.body.data.attributes.amount, 100)
    // Do not return authorization in response (by the moment)
    assert.equal(response.body.data.attributes.authorization, undefined)

    // check balances
    const response1 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)
    assert.equal(response1.body.data.attributes.balance, -100)

    const response2 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user1)
    assert.equal(response2.body.data.attributes.balance, 100)

    
  })

  it('Transfer with tag (invalid)', async () => {
    await t.api.post(`/TEST/transfers`, {
      data: {
        attributes: {
          amount: 100,
          meta: {
            description: 'Transfer preauthorized with tag',
          },
          state: 'committed',
          authorization: {
            type: 'tag',
            value: 'tag-X-XXXXXXXXXX'
          }
        },
        relationships: {
          payer: { data: { type: 'accounts', id: t.account1.id }},
          payee: { data: { type: 'accounts', id: t.account2.id }},
        }
      }
    }, t.user2, 403)

    await t.api.post(`/TEST/transfers`, {
      data: {
        attributes: {
          amount: 100,
          meta: {
            description: 'Transfer preauthorized with tag',
          },
          state: 'committed',
          authorization: {
            type: 'tag',
            value: 'tag-X-XXXXXXXXXX'
          }
        },
        relationships: {
          payer: { data: { type: 'accounts', id: t.account2.id }},
          payee: { data: { type: 'accounts', id: t.account1.id }},
        }
      }
    }, t.user1, 403)

  })
})