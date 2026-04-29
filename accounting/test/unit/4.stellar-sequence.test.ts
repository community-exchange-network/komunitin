import assert from "node:assert"
import { describe, it } from "node:test"

import { StellarAccount } from "../../src/ledger/stellar/account"

const fakeHorizonAccount = (sequence: bigint) => {
  let internalSequence = sequence

  return {
    sequence: internalSequence.toString(),
    sequenceNumber() {
      return internalSequence.toString()
    },
    incrementSequenceNumber() {
      internalSequence += 1n
      this.sequence = internalSequence.toString()
    }
  }
}

describe("Stellar account sequence handling", async () => {
  await it("keeps the locally incremented sequence when a refresh resolves with an older Horizon snapshot", async () => {
    // Function to "manually" return a Horizon account.
    let resolveLoaded: ((account: ReturnType<typeof fakeHorizonAccount>) => void) | undefined

    const currency = {
      ledger: {
        loadAccount: () => new Promise(resolve => resolveLoaded = resolve),
        hasPendingTransaction: () => false
      }
    }
    // Initialize an account with seq = 10.
    const stellarAccount = new StellarAccount("xyz", currency as any)
    const cachedAccount = fakeHorizonAccount(10n)
    ;(stellarAccount as any).account = cachedAccount
    
    // Call the update() while seq = 10.
    const updatePromise = stellarAccount.update()

    // Simulate a concurrent seq increment while the refresh is in flight,
    // which can happen when a transaction is built.
    cachedAccount.incrementSequenceNumber()

    // Return from horizon with the original seq = 10. Horizon still does not 
    // count the concurrent transaction build.
    assert.ok(resolveLoaded, "Expected update() to call loadAccount().")
    resolveLoaded?.(fakeHorizonAccount(10n))
    await updatePromise

    // Get the refreshed account, which should have seq = 11 because the inner
    // update() should have detected the concurrent local increment and applied it.
    const refreshedAccount = stellarAccount.getStellarAccount() as ReturnType<typeof fakeHorizonAccount>

    assert.equal(refreshedAccount.sequence, "11")
    assert.equal(refreshedAccount.sequenceNumber(), "11")
  })

  await it("drops a higher local sequence that already existed before the refresh started", async () => {
    const currency = {
      ledger: {
        loadAccount: async () => fakeHorizonAccount(10n),
        hasPendingTransaction: () => false
      }
    }
    // Initialize an account with seq = 11.
    const stellarAccount = new StellarAccount("xyz", currency as any)
    ;(stellarAccount as any).account = fakeHorizonAccount(11n)
    
    // Get the refreshed account from horizon, having seq = 10.
    await stellarAccount.update()

    // Get the refreshed account, which should have seq = 10.
    const refreshedAccount = stellarAccount.getStellarAccount() as ReturnType<typeof fakeHorizonAccount>

    assert.equal(refreshedAccount.sequence, "10")
    assert.equal(refreshedAccount.sequenceNumber(), "10")
  })

  await it("keeps the higher local sequence if there was a pending transaction at the beginning of the refresh", async () => {
    const currency = {
      ledger: {
        loadAccount: async () => fakeHorizonAccount(10n),
        hasPendingTransaction: () => true
      }
    }
    // Initialize an account with seq = 11.
    const stellarAccount = new StellarAccount("xyz", currency as any)
    ;(stellarAccount as any).account = fakeHorizonAccount(11n)
    
    // Get the refreshed account from horizon, having seq = 10.
    await stellarAccount.update()

    // Get the refreshed account, which should have seq = 11 because there was a pending transaction at the beginning of the refresh.
    const refreshedAccount = stellarAccount.getStellarAccount() as ReturnType<typeof fakeHorizonAccount>

    assert.equal(refreshedAccount.sequence, "11")
    assert.equal(refreshedAccount.sequenceNumber(), "11")
  })


})