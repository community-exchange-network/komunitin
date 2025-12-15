import { describe, it, before, after } from "node:test"
import assert from "node:assert"

import { Ledger, LedgerCurrency, LedgerCurrencyConfig, LedgerCurrencyData, LedgerCurrencyKeys, PathQuote } from "../../src/ledger"
import { createStellarLedger, StellarLedger } from "../../src/ledger/stellar"
import { Keypair } from "@stellar/stellar-sdk"
import { initUpdateExternalOffers } from "src/ledger/update-external-offers"
import { friendbot } from "src/ledger/stellar/friendbot"
import { config } from "src/config"
import { logger } from "src/utils/logger"

/**
 * Test the Stellar ledger implementation using the real Stellar testnet.
 * Note that this test is not 100% deterministic because it depends on the 
 * 
 * Stellar testnet and in any case it may take up to 2 minutes to run.
 */
describe('Creates stellar elements', async () => {
  let ledger: Ledger
  let sponsor: Keypair

  let currency: LedgerCurrency
  let currencyKeys: LedgerCurrencyKeys
  let currencyData: LedgerCurrencyData
  let currencyConfig: LedgerCurrencyConfig

  let currency2: LedgerCurrency
  let currency2Keys: LedgerCurrencyKeys

  before(async () => {
    logger.level = "debug"
    // Create and fund a sponsor account.
    sponsor = Keypair.random()
    await friendbot(config.STELLAR_FRIENDBOT_URL, sponsor.publicKey())

    // Instantiate the ledger.
    ledger = await createStellarLedger({
      server: config.STELLAR_HORIZON_URL,
      network: config.STELLAR_NETWORK,
      sponsorPublicKey: sponsor.publicKey(),
      domain: "example.com"
    }, sponsor)

    // Needed for external trade.
    initUpdateExternalOffers(ledger, async () => sponsor, async (currency) => {
      // Get the privatey keys for the external trader accounts.
      return currency.asset().code == "TEST" ? currencyKeys.externalTrader : currency2Keys.externalTrader
    })
  })

  after(() => {
    // Remove the listeners.
    ledger.stop()
    logger.level = "info"
  })

  const pubKeyRegex = /G[A-Z0-9]{55}/
  await it('should be able to create a new currency', async () => {
    currencyConfig = {
      code: "TEST",
      rate: { n: 1, d: 10 }, //1 TEST = 0.1 HOUR
      externalTraderInitialCredit: "1000",
      externalTraderMaximumBalance: "5000"
      
    }
    currencyKeys = await ledger.createCurrency(currencyConfig, sponsor)
    currencyData = {
      adminPublicKey: currencyKeys.admin.publicKey(),
      issuerPublicKey: currencyKeys.issuer.publicKey(),
      creditPublicKey: currencyKeys.credit.publicKey(),
      externalIssuerPublicKey: currencyKeys.externalIssuer.publicKey(),
      externalTraderPublicKey: currencyKeys.externalTrader.publicKey()
    }
    currency = ledger.getCurrency(currencyConfig, currencyData)

    assert.notEqual(currency, undefined)

    assert.match(currencyKeys.issuer.publicKey(), pubKeyRegex)
    assert.match(currencyKeys.credit.publicKey(), pubKeyRegex)
    assert.match(currencyKeys.admin.publicKey(), pubKeyRegex)
    assert.match(currencyKeys.externalIssuer.publicKey(), pubKeyRegex)
    assert.match(currencyKeys.externalTrader.publicKey(), pubKeyRegex)
  })

  let accountKey: Keypair
  await it('should be able to create a new account', async () => {
    const result = await currency.createAccount({
      initialCredit: "1000"
    }, {
      sponsor: sponsor,
      issuer: currencyKeys.issuer,
      credit: currencyKeys.credit
    })
    accountKey = result.key
    assert.notEqual(accountKey, undefined)
    assert.match(accountKey.publicKey(), pubKeyRegex)
    const account = await currency.getAccount(accountKey.publicKey())
    assert.equal(account.balance(), "1000.0000000")
  })

  let account2Key: Keypair
  await it('should be able to pay from one account to another', async () => {
    account2Key = (await currency.createAccount({
      initialCredit: "1000"
    }, { sponsor, issuer: currencyKeys.issuer, credit: currencyKeys.credit })).key
    const account = await currency.getAccount(accountKey.publicKey())
    await account.pay({ payeePublicKey: account2Key.publicKey(), amount: "100" }, { account: accountKey, sponsor })
    await account.update()
    assert.equal(account.balance(), "900.0000000")
    const account2 = await currency.getAccount(account2Key.publicKey())
    assert.equal(account2.balance(), "1100.0000000")
  })

  await it('should be able to delete an account', async () => {
    const account2 = await currency.getAccount(account2Key.publicKey())
    await account2.delete({ admin: currencyKeys.admin, sponsor })
    try {
      account2.balance()
      assert.fail("Account should have been deleted")
    } catch (error) {
      assert.equal((error as Error).message, "Account not found")
    }
  })

  await it('should be able to disable and re-enable an account', async () => {
    const account = await currency.getAccount(accountKey.publicKey())
    const balance = account.balance()
    const credit = await account.credit()

    const disabledAccountsPoolKey = (await currency.createAccount({ initialCredit: "0" }, {
      sponsor,
      issuer: currencyKeys.issuer
    })).key

    currencyData = {
      ...currencyData,
      disabledAccountsPoolPublicKey: disabledAccountsPoolKey.publicKey()
    }
    currency.setData(currencyData)

    await account.disable({ admin: currencyKeys.admin, sponsor })
    // check that account is disabled
    try {
      await currency.getAccount(accountKey.publicKey())
      assert.fail("Account should not exist in the ledger")
    } catch (error) {
      assert.equal((error as Error).message, "Not Found")
    }
    // Re-enable account
    await currency.enableAccount({
      balance,
      credit,
    }, {
      account: accountKey,
      issuer: currencyKeys.issuer,
      disabledAccountsPool: disabledAccountsPoolKey,
      sponsor: sponsor
    })

    const enabled = await currency.getAccount(accountKey.publicKey())
    assert.equal(enabled.balance(), balance)
    assert.equal(await enabled.credit(), credit)

  })

  await it.skip('should be able to perform path payments', async () => {
    // Create a second currency.
    const config = {
      code: "TES2",
      rate: { n: 1, d: 2 }, // 1TES2 = 0.5 HOUR
      externalTraderInitialCredit: "1000",
      externalTraderMaximumBalance: "5000"
    }
    currency2Keys = await ledger.createCurrency(config, sponsor)
    currency2 = ledger.getCurrency(config, {
      adminPublicKey: currency2Keys.admin.publicKey(),
      issuerPublicKey: currency2Keys.issuer.publicKey(),
      creditPublicKey: currency2Keys.credit.publicKey(),
      externalIssuerPublicKey: currency2Keys.externalIssuer.publicKey(),
      externalTraderPublicKey: currency2Keys.externalTrader.publicKey()
    })

    await assert.doesNotReject(
      currency2.reconcileExternalState([{
        limit: "10",
        trustedPublicKey: currencyKeys.externalIssuer.publicKey()
      }], {
        sponsor,
        externalTrader: currency2Keys.externalTrader,
        externalIssuer: currency2Keys.externalIssuer,
        credit: currency2Keys.credit
      })
    )
    
    // Create account from currency 2
    const { key: key2 } = await currency2.createAccount({
      initialCredit: "1000"
    }, {
      sponsor,
      issuer: currency2Keys.issuer,
      credit: currency2Keys.credit
    })
    // Create account from currency 1
    const { key: key1 } = await currency.createAccount({
      initialCredit: "1000"
    }, {
      sponsor,
      issuer: currencyKeys.issuer,
      credit: currencyKeys.credit
    })
    // Create a path payment from currency 1 to currency 2.
    const path = await currency.quotePath({
      destCode: "TES2",
      destIssuer: currency2Keys.issuer.publicKey(),
      amount: "5" // 2.5 hours.
    })
    assert.notEqual(path, false)
    if (!path) {
      return
    }
    assert.equal(path.sourceAmount, "25.0000000")
    assert.equal(path.destAmount, "5.0000000")
    assert.equal(path.sourceAsset.code, "TEST")
    assert.equal(path.destAsset.code, "TES2")
    assert.equal(path.path.length, 2)
    assert.equal(path.path[0].code, "HOUR")
    assert.equal(path.path[0].issuer, currencyKeys.externalIssuer.publicKey())
    assert.equal(path.path[1].code, "HOUR")
    assert.equal(path.path[1].issuer, currency2Keys.externalIssuer.publicKey())
    const account1 = await currency.getAccount(key1.publicKey())
    await assert.doesNotReject(account1.externalPay({
      payeePublicKey: key2.publicKey(),
      amount: "5", // in TES2 currency. This is 2.5 hours.
      path
    }, {
      account: key1,
      sponsor
    }))
    await account1.update()
    assert.equal(account1.balance(), "975.0000000")
    const account2 = await currency2.getAccount(key2.publicKey())
    assert.equal(account2.balance(), "1005.0000000")

    // Now the currency 2 has a surplus of 1.5 hours, so they can buy to currency 
    // 1 members even if currency 1 has not trusted currency 2. We need to wait,
    // however, for the trade offers to be set.
    // For some unknown reason, the standalone stellar server may take up to 1
    // minute to stream the trade offers, so we wait for them.
    const promise = new Promise<void>((resolve, reject) => {
      const fn = async () => {
        try {
          ledger.removeListener("externalOfferUpdated", fn)
          const path2 = await currency2.quotePath({
            destCode: "TEST",
            destIssuer: currencyKeys.issuer.publicKey(),
            amount: "5",
            retry: true
          })
          assert.notEqual(path2, false)
          await assert.doesNotReject(account2.externalPay({
            payeePublicKey: key1.publicKey(),
            amount: "5", // in external currency
            path: path2 as PathQuote
          }, {
            account: key2,
            sponsor
          }))
          await account1.update()
          assert.equal(account1.balance(), "980.0000000")
          await account2.update()
          assert.equal(account2.balance(), "1004.0000000")
          resolve()
        } catch (error) {
          reject(error)
        }
      }
      ledger.addListener("externalOfferUpdated", fn)
    })
    await assert.doesNotReject(promise)
  })
})