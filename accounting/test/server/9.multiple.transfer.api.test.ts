import { after, before, describe, it } from "node:test"
import assert from "node:assert"

import { setupServerTest } from './setup'
import { testTransfer } from "./api.data"
import { setConfig } from "src/config"
import { logger } from "src/utils/logger"
import { sleep } from "src/utils/sleep"

describe('Runs multiple transfers in parallel', async () => {
  // Wait for other tests/requests to stop counting in Horizon rate limit.
  const wait5secPromise = sleep(6000)
  setConfig({
    STELLAR_CHANNEL_ACCOUNTS_ENABLED: true
  })

  before(async () => {
    logger.level = "debug"
  })
  after(async () => {
    logger.level = "info"
  })

  const t = setupServerTest()
  it ('A few transfers at once', async() => {
    const d1 = testTransfer(t.account1.id, t.account2.id, 5, "Transfer 1", "committed")
    const d2 = testTransfer(t.account1.id, t.account0.id, 5, "Transfer 2", "committed")
    const d3 = testTransfer(t.account1.id, t.account2.id, 5, "Transfer 3", "committed")
    const d4 = testTransfer(t.account1.id, t.account0.id, 5, "Transfer 4", "committed")
    const data = [d1.data, d2.data, d3.data, d4.data]
    const response = await t.api.post('/TEST/transfers', { data }, t.user1, 201)
    const transfers = response.body.data
    assert.equal(transfers.length, 4)
    // Check balances
    const account1 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)
    assert.equal(account1.body.data.attributes.balance, -20)
    const account2 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user1)
    assert.equal(account2.body.data.attributes.balance, 10)
  })
  await it('100 transfers at once', async () => {
    
    const data = Array.from({length: 100}, (_, i) => {
      const doc = testTransfer(t.account1.id, t.account2.id, 5, `Transfer ${i}`, "committed")
      return doc.data
    })
    await wait5secPromise
    const response = await t.api.post('/TEST/transfers', { data }, t.user1, 201)
    const transfers = response.body.data
    assert.equal(transfers.length, 100)
    // Check balances
    const account1 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)
    assert.equal(account1.body.data.attributes.balance, -520)
    const account2 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user1)
    assert.equal(account2.body.data.attributes.balance, 510)

  })
})