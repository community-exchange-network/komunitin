import assert from "node:assert"
import { randomUUID } from "node:crypto"
import { describe, it } from "node:test"
import { setupServerTest } from "./setup"

describe('Account tag ownership', () => {
  const t = setupServerTest()

  it('rejects foreign and unknown tag IDs without changing existing tags', async () => {
    const owner = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: { attributes: { tags: [{ name: 'Owner tag', value: 'owner-tag-1234567890' }] } }
    }, t.user1)
    const victim = await t.api.patch(`/TEST/accounts/${t.account2.id}/settings`, {
      data: { attributes: { tags: [{ name: 'Victim tag', value: 'victim-tag-1234567890' }] } }
    }, t.user2)
    const ownerTags = owner.body.data.attributes.tags
    const victimTags = victim.body.data.attributes.tags

    for (const id of [victimTags[0].id, randomUUID()]) {
      await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
        data: { attributes: { tags: [{ id, name: 'Unauthorized rename' }] } }
      }, t.user1, 403)
    }
    for (const [account, user, tags] of [
      [t.account1, t.user1, ownerTags],
      [t.account2, t.user2, victimTags]
    ]) {
      const response = await t.api.get(`/TEST/accounts/${account.id}/settings`, user)
      assert.deepEqual(response.body.data.attributes.tags, tags)
    }

    const renamed = await t.api.patch(`/TEST/accounts/${t.account1.id}/settings`, {
      data: { attributes: { tags: [{ id: ownerTags[0].id, name: 'Renamed owner tag' }] } }
    }, t.user1)
    assert.equal(renamed.body.data.attributes.tags[0].name, 'Renamed owner tag')
    assert.equal(renamed.body.data.attributes.tags[0].id, ownerTags[0].id)
  })
})
