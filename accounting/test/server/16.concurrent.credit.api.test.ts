import { describe, it } from "node:test"
import assert from "node:assert"
import { setupServerTest } from "./setup"

describe("Concurrent credit limit updates", async () => {
  const t = setupServerTest()

  await it('concurrent credit updates produce consistent state', async () => {
    // Start with account1 having creditLimit=1000 (the default).
    const initial = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.admin)).body.data
    assert.equal(initial.attributes.creditLimit, 1000)

    // Send two concurrent credit limit updates to the same account.
    // With proper row locking, these should serialize: one completes first,
    // then the second reads the updated value and applies correctly.
    const [res1, res2] = await Promise.all([
      t.api.patch(`/TEST/accounts/${t.account1.id}`, {
        data: { attributes: { creditLimit: 2000 } }
      }, t.admin),
      t.api.patch(`/TEST/accounts/${t.account1.id}`, {
        data: { attributes: { creditLimit: 3000 } }
      }, t.admin),
    ])

    // Both requests should succeed.
    assert.equal(res1.status, 200)
    assert.equal(res2.status, 200)

    // The final credit limit must be one of the two values (whichever finished last).
    const account = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.admin)).body.data
    const finalCredit = account.attributes.creditLimit
    assert.ok(
      finalCredit === 2000 || finalCredit === 3000,
      `Expected creditLimit to be 2000 or 3000, got ${finalCredit}`
    )

    // Verify consistency: make a payment that exactly uses the full credit limit.
    // If Stellar and DB are out of sync, this will either fail or produce a wrong balance.
    await t.payment(t.account1.id, t.account2.id, finalCredit, "Use full credit", "committed", t.user1, 201)

    const a1 = (await t.api.get(`/TEST/accounts/${t.account1.id}`, t.admin)).body.data
    assert.equal(a1.attributes.balance, -finalCredit)
  })
})
