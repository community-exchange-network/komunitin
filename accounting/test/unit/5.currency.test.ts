import { describe, it } from "node:test"
import assert from "node:assert"
import { defaultCurrencySettings } from "../../src/controller/currency-controller"
import { type CreateCurrency } from "../../src/model"

describe("Currency defaults", () => {
  it("Calculates a nice default initial credit limit and external trader maximum balance", () => {
    const currency = {
      code: "TEST",
      name: "Testy",
      scale: 4,
      rate: {n: 1, d: 13},
    }
    const config = defaultCurrencySettings(currency as CreateCurrency)
    // The default initial credit limit should be 12 hours in local currency, which is 12 * 10^4 * 13 / 1 = 1560000 ~ 1_500_000.
    assert.equal(config.defaultInitialCreditLimit,1_500_000)
    assert.equal(config.externalTraderCreditLimit,1_500_000)
    // The default external trader maximum balance should be 1000 hours in local currency, which is 1000 * 10^4 * 13 / 1 = 130000000 ~ 150_000_000
    assert.equal(config.externalTraderMaximumBalance,150_000_000)
  })
})

    