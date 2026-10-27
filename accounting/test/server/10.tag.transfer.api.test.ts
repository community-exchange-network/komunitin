import { before, describe, it } from "node:test"
import assert from "node:assert"
import { validate as isUuid } from "uuid"

import { setupServerTest } from './setup'

describe('Preauthorized transfers with NFC tags', async () => {
  const t = setupServerTest()

  await it('Create account tags', async () => {
    // Allow account 1 to have tags
    const adminResponse = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          allowTagPayments: true,
        }
      }
    }, t.admin)

    assert.equal(adminResponse.body.data.type, 'account-settings')
    assert.equal(adminResponse.body.data.attributes.allowTagPayments, true)
    
    // Create tags for account 1
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

  await it('Update account tags (forbidden)', async () => {
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

  await it('Get account tags', async () => {
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user1)

    assert.equal(response.body.data.type, 'account-settings')
    assert.equal(response.body.data.attributes.allowTagPayments, true)
    assert.equal(response.body.data.attributes.tags.length, 2)

    assert.equal(response.body.data.attributes.tags[0].name, 'Tag 1')
    assert.ok(isUuid(response.body.data.attributes.tags[0].id))
    assert.ok(response.body.data.attributes.tags[0].updated)
    assert.equal(response.body.data.attributes.tags[0].value, undefined)
  })

  await it('Get account tags (unauthorized)', async () => {
    await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user2, 403)
  })

  await it('Get account by tag', async () => {
    const response = await t.api.get(`/TEST/accounts?filter[tag]=tag-1-1234567890`, t.user2)
    assert.equal(response.body.data.length, 1)
    assert.equal(response.body.data[0].id, t.account1.id)
  })

  await it('Transfer with tag', async () => {
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

  await it('Transfer with tag (invalid)', async () => {
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

  it('Tags persist after updating account settings', async () => {
    // Update some other account setting
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: {
        attributes: {
          allowTagPayments: false,
        }
      }
    }, t.admin)

    // Tags should still be there
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user1)
    assert.equal(response.body.data.attributes.allowTagPayments, false)
    assert.equal(response.body.data.attributes.tags.length, 2)
    assert.equal(response.body.data.attributes.tags[0].name, 'Tag 1')
    assert.equal(response.body.data.attributes.tags[1].name, 'Tag 2')
  })

  it ('Tags persist after updating other accounts tags', async () => {
    // Update account 2 tags
    await t.api.patch(`/TEST/accounts/${t.account2.id}/settings`, {
      data: {
        attributes: {
          tags: [{
            name: "Tag A",
            value: "tag-A-1234567890",
          }]
        }
      }
    }, t.user2)

    // Account 1 tags should still be there
    const response = await t.api.get(`/TEST/accounts/${t.account1.id}/settings`, t.user1)
    assert.equal(response.body.data.attributes.allowTagPayments, false)
    assert.equal(response.body.data.attributes.tags.length, 2)
    assert.equal(response.body.data.attributes.tags[0].name, 'Tag 1')
    assert.equal(response.body.data.attributes.tags[1].name, 'Tag 2')
  })
})

describe('Account tag balance privacy', async () => {
  const t = setupServerTest()
  const tags = ['privacy-tag-1234567890', 'privacy/tag?value=1234567890&x=1#tag']
  const monetaryFields = ['balance', 'creditLimit', 'maximumBalance']

  before(async () => {
    await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: { attributes: { tags: tags.map((value, index) => ({ name: `Tag ${index}`, value })) } }
    }, t.user1)
    await t.api.patch(`/TEST/accounts/${t.account1.id}`, {
      data: { attributes: { maximumBalance: 20000 } }
    }, t.admin)
  })

  for (const { name, defaultHideBalance, hideBalance, visibleToMember } of [
    { name: 'visible balances', defaultHideBalance: false, hideBalance: undefined, visibleToMember: true },
    { name: 'currency privacy default', defaultHideBalance: true, hideBalance: undefined, visibleToMember: false },
    { name: 'private account override', defaultHideBalance: false, hideBalance: true, visibleToMember: false },
    { name: 'visible account override', defaultHideBalance: true, hideBalance: false, visibleToMember: true },
  ]) {
    await it(`Tag lookup respects ${name}`, async () => {
      await t.api.patch('/TEST/currency/settings', {
        data: { attributes: { defaultHideBalance } }
      }, t.admin)
      if (hideBalance !== undefined) {
        await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
          data: { attributes: { hideBalance } }
        }, t.admin)
      }

      for (const { auth, visible } of [
        { auth: undefined, visible: false },
        { auth: { ...t.user2, user: 'unknown-user' }, visible: false },
        { auth: t.user2, visible: visibleToMember },
        { auth: t.user1, visible: true },
        { auth: t.admin, visible: true },
        { auth: t.superadmin, visible: true },
      ]) {
        for (const tag of tags) {
          const response = await t.api.get(`/TEST/accounts?filter[tag]=${encodeURIComponent(tag)}&include=settings,currency`, auth)
          assert.equal(response.body.data.length, 1)
          const account = response.body.data[0]
          assert.equal(account.id, t.account1.id)
          for (const field of monetaryFields) {
            assert.equal(Object.hasOwn(account.attributes, field), visible, `${field} visibility for ${auth?.user ?? 'anonymous'}`)
            if (visible) {
              assert.equal(account.attributes[field], field === 'maximumBalance' ? 20000 : t.account1.attributes[field])
            }
          }
        }
      }
    })
  }

  await it('Unknown tags still return an empty collection', async () => {
    const response = await t.api.get('/TEST/accounts?filter[tag]=unknown-tag-1234567890')
    assert.deepEqual(response.body.data, [])
  })

  await it('Multiple tag filters are rejected', async () => {
    await t.api.get(`/TEST/accounts?filter[tag][]=${tags[0]}&filter[tag][]=unknown-tag-1234567890`, t.user2, 400)
  })
})
