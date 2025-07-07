import {describe, it} from "node:test"
import assert from "node:assert"
import { setupServerTest, TestSetupWithCurrency } from "../server/setup"
import { setConfig } from "src/config"
import { sleep } from "src/utils/sleep"
import { generateCcTransaction } from "./api.data"

describe('receive', async () => {
  // copied from https://github.com/komunitin/komunitin/blob/273b3a136d9bc4a7f36ced9343a989eb6d15630e/accounting/test/server/9.multiple.transfer.api.test.ts#L13-L17
  // Wait for other tests/requests to stop counting in Horizon rate limit.
  const wait5secPromise = sleep(6000)
  setConfig({
    STELLAR_CHANNEL_ACCOUNTS_ENABLED: true
  })

  // This calls /TEST/creditCommonsNodes and adds a trunkward neighbour 'trunk' with last-hash 'trunk':
  const t = setupServerTest(true, true, 100000)

  it('Checks the last-hash header', async () => {
    const ccTransaction = generateCcTransaction()
    const response = await t.api.post("/TEST/cc/transaction/relay", ccTransaction, { user: null, scopes: [], ccNode: 'trunk', lastHash: 'qwer' }, 401)
    assert.equal(response.text, '{"errors":["value of last-hash header \\"qwer\\" does not match our records."]}')
  })

  it('Updates the balances and last-hash', async () => {
    const hashBefore = 'trunk'
    const hashAfter = '196bf56fdf9c2b747a20b8604b7b1f61'
    const ccTransaction = generateCcTransaction('3d8ebb9f-6a29-42cb-9d39-9ee0a6bf7f1c', 'trunk/branch/twig/alice', false)
    // Check balances before
    t.account0 = (await t.api.get(`/TEST/accounts/${t.account0.id}`, t.admin)).body.data
    assert.equal(t.account0.attributes.balance, 0)
    t.account2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    assert.equal(t.account2.attributes.balance, 0)
    const accountStatusBefore = await t.api.get(`/TEST/cc/account?acc_path=TEST0002`, { user: null, scopes: [], ccNode: 'trunk', lastHash: hashBefore }, 200)
    assert.deepEqual(accountStatusBefore.body, {
      balance: 0,
      entries: 0,
      gross_in: 0,
      gross_out: 0,
      partners: 0,
      pending: 0,
      trades: 0
    })
    const accountHistoryBefore = await t.api.get(`/TEST/cc/account/history?acc_path=TEST0002`, { user: null, scopes: [], ccNode: 'trunk', lastHash: hashBefore }, 200)
    assert.deepEqual(accountHistoryBefore.body, {
      data: {},
      meta: {
        end: '0000-01-01 00:00:00',
        max: 0,
        min: null,
        points: 0,
        start: '9999-01-01 00:00:00'
      }
    })
    const response = await t.api.post(
      "/TEST/cc/transaction/relay",
      ccTransaction,
      { user: null, scopes: [], ccNode: 'trunk', lastHash: hashBefore },
      201)
    assert.equal(JSON.stringify(response.body.data, null, 2), JSON.stringify(ccTransaction.entries, null, 2))
    const expectedNetGain = (.01) * 10000
    // Check balances after
    t.account0 = (await t.api.get(`/TEST/accounts/${t.account0.id}`, t.admin)).body.data
    assert.equal(t.account0.attributes.balance, -expectedNetGain)
    t.account2 = (await t.api.get(`/TEST/accounts/${t.account2.id}`, t.user2)).body.data
    assert.equal(t.account2.attributes.balance, expectedNetGain)
    const accountStatusAfter = await t.api.get(`/TEST/cc/account?acc_path=TEST0002`, { user: null, scopes: [], ccNode: 'trunk', lastHash: hashAfter }, 200)
    assert.deepEqual(accountStatusAfter.body, {
      balance: 8,
      entries: 1,
      gross_in: 8,
      gross_out: 0,
      partners: 0,
      pending: 0,
      trades: 1
    })
    const accountHistoryAfter = await t.api.get(`/TEST/cc/account/history?acc_path=TEST0002`, { user: null, scopes: [], ccNode: 'trunk', lastHash: hashAfter }, 200)
    const transDates = Object.keys(accountHistoryAfter.body.data)
    assert.equal(transDates.length, 1)
    assert.deepEqual(accountHistoryAfter.body, {
      data: {
        [transDates[0]]: 8
      },
      meta: {
        end: transDates[0],
        max: 8,
        min: 8,
        points: 0,
        start: transDates[0]
      }
    })
  })
})