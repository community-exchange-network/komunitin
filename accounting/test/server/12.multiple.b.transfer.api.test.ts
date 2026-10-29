import { describe, it } from "node:test"
import assert from "node:assert"
import { setupServerTest } from "./setup"
import { testTransfer } from "./api.data"
import { logger } from "../../src/utils/logger"
import { http, HttpResponse, passthrough } from "msw"
import { config } from "../../src/config"
import { addHandlers } from "./net.mock"

/**
 * This test checks that concurrent transfers still work without channel accounts.
 */
describe('Multiple parallel transfers without channel accounts', async () => {
  const t = setupServerTest()
  logger.level = "debug"

  it('should retry parallel transfers in sequence after a submission failure', async () => {
    // Retry the first submission while later transfers are queued for the same account.
    let submissions = 0
    addHandlers(http.post(`${config.STELLAR_HORIZON_URL}/transactions`, () => {
      submissions++
      return submissions === 1 ? new HttpResponse(null, { status: 503 }) : passthrough()
    }))

    const data = Array.from({length: 10}, (_, i) => {
      const doc = testTransfer(t.account1.id, t.account2.id, i+1, `Transfer ${i}`, "committed")
      return doc.data
    })
    const response = await t.api.post('/TEST/transfers', { data }, t.user1, 201)
    const transfers = response.body.data
    assert.equal(transfers.length, 10)
    assert.ok(submissions >= 11)
    // Check balances
    const account1 = await t.api.get(`/TEST/accounts/${t.account1.id}`, t.user1)
    assert.equal(account1.body.data.attributes.balance, -55)
    const account2 = await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user1)
    assert.equal(account2.body.data.attributes.balance, 55)

  })

})
