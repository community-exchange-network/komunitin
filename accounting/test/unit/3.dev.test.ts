import { describe, it } from "node:test"
import assert from "node:assert"
import { createStellarLedger, StellarLedger } from "../../src/ledger/stellar"
import { Asset, Keypair } from "@stellar/stellar-sdk"
import { friendbot } from "../../src/ledger/stellar/friendbot"
import { config } from "../../src/config"

/**
 * This is a development test that is not part of the CI/CD pipeline.
 */
describe.skip('Crypto', () => {
  it('Concurrent test', async () => {
    const a1 = Keypair.random()
    const a2 = Keypair.random()
    await friendbot(config.STELLAR_FRIENDBOT_URL, a1.publicKey())
    await friendbot(config.STELLAR_FRIENDBOT_URL, a2.publicKey())

    const ledger = await createStellarLedger({
      server: config.STELLAR_HORIZON_URL,
      network: config.STELLAR_NETWORK,
      sponsorPublicKey: a1.publicKey(),
      domain: "example.com"
    }, a1) as StellarLedger

    //const rateLimiter = rateLimitRunner(80, 1000)
    const server = ledger.getServerWithoutRateProtection()
    const n = 1000

    const accounts = await server.accounts().forAsset(new Asset('USDC', "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5")).limit(200).call()
    const records = accounts.records
    for (let i=0; i< 1000/200; i++) {
      const resilt = await accounts.next()
      records.push(...resilt.records)
    }
    
    // Try to create n transactions at once
    
    try {
      const results = await Promise.all(
        Array.from({length: n}, (_, i) => ledger.getServerWithoutRateProtection().loadAccount(records[i].account_id)
        )
      )
      assert.equal(results.length, n)
    } catch (e) {
      assert.fail(e as Error)
    }
    
    
  })
})