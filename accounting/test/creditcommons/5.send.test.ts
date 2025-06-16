import {describe, it} from "node:test"
import assert from "node:assert"
import { setupServerTest } from "../server/setup"
import { setConfig, config } from "src/config"
import { CreditCommonsNode } from "src/model/creditCommons"
import { logger } from "src/utils/logger"
import { sleep } from "src/utils/sleep"
import { testCurrency, userAuth, testCreditCommonsNeighbour } from "../server/api.data"
import { generateCcTransaction } from "./api.data"

describe('send', async () => {
  // copied from https://github.com/komunitin/komunitin/blob/273b3a136d9bc4a7f36ced9343a989eb6d15630e/accounting/test/server/9.multiple.transfer.api.test.ts#L13-L17
  // Wait for other tests/requests to stop counting in Horizon rate limit.
  const wait5secPromise = sleep(6000)
  setConfig({
    STELLAR_CHANNEL_ACCOUNTS_ENABLED: true
  })

  // This calls /TEST/creditCommonsNodes and adds a trunkward neighbour 'trunk' with last-hash 'trunk':
  const t = setupServerTest(true, true, 100000)

  logger.level = "debug"
  const eAdminAuth = userAuth("10")
  const eUser1Auth = userAuth("11")

  let eCurrency: any
  let eAccount1: any
  let eVostro: any
  
  it('Allows trunk/EXTR0000 to  send to trunk/branch2/NET20002', async () => {
    // Create secondary currency
    const response = await t.api.post('/currencies', testCurrency({
      code: "EXTR",
      rate: {
        n: 1,
        d: 2
      }
    }), eAdminAuth)
    eCurrency = response.body.data
    // Create account in EXTR for user1
    eAccount1 = await t.createAccount(eUser1Auth.user, "EXTR", eAdminAuth)
    eVostro = await t.createAccount(eAdminAuth.user, "EXTR", eAdminAuth)
    const neighbour: CreditCommonsNode = {
      peerNodePath: 'trunk/branch2',
      ourNodePath: 'trunk',
      lastHash: 'trunk',
      url: `${config.API_BASE_URL}/TEST/cc/`,
      vostroId: eVostro.id
    }
    await t.api.post('/EXTR/cc/nodes', testCreditCommonsNeighbour(neighbour), eAdminAuth)
    assert.equal(eCurrency.attributes.code, 'EXTR')
    assert.equal(typeof eVostro.id, 'string')
    const body = {
      data: {
        attributes: generateCcTransaction('3d8ebb9f-6a29-42cb-9d39-9ee0a6bf7f1c', `trunk/${eAccount1.attributes.code}`, false)
      }
    };
    await t.api.post('/EXTR/cc/send', body, eUser1Auth)
  })
})