import {describe, it} from "node:test"
import assert from "node:assert"
import { setupServerTest, TestSetupWithCurrency } from "../server/setup"
import { setConfig } from "src/config"
import { sleep } from "src/utils/sleep"
import { generateCcTransaction } from "./api.data"

describe('receive', async () => {

  // This calls /TEST/creditCommonsNodes and adds a trunkward neighbour 'trunk' with last-hash 'trunk':
  const t = setupServerTest(true, true, 100000)

  it('Checks the last-hash header', async () => {
    const ccTransaction = generateCcTransaction('non-existing')
    const response = await t.api.patch(`/TEST/cc/transaction/${ccTransaction.uuid}/C`, ccTransaction, { user: null, scopes: [], ccNode: 'trunk', lastHash: 'qwer' }, 401)
    assert.equal(response.text, '{"errors":["value of last-hash header \\"qwer\\" does not match our records."]}')
  })

  it('Fails if the transaction does not exist', async () => {
    const result = await t.api.patch(`/TEST/cc/transaction/non-existing/C`, {}, { user: null, scopes: [], ccNode: 'trunk', lastHash: 'trunk' }, 404)
    assert.equal(result.text, '{"errors":["Transfer non-existing not found"]}')
  })

  it('Is not implemented yet if the transaction exists', async () => {
    const hashBefore = 'trunk'
    const hashAfter = 'trunk'
    const ccTransaction = generateCcTransaction('existing')
    await t.api.post(
      "/TEST/cc/transaction/relay",
      ccTransaction,
      { user: null, scopes: [], ccNode: 'trunk', lastHash: hashBefore },
      400)
    const result = await t.api.patch(`/TEST/cc/transaction/${ccTransaction.uuid}/C`, {}, { user: null, scopes: [], ccNode: 'trunk', lastHash: hashAfter }, 500)
    assert.equal(result.text, '{"errors":["not implemented yet"]}')
  })
})