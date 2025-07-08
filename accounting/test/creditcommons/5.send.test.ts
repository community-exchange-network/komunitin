import {describe, it} from "node:test"
import assert from "node:assert"
import { setupServerTest } from "../server/setup"
import { config } from "src/config"
import { CreditCommonsNode } from "src/model/creditCommons"
import { logger } from "src/utils/logger"
import { testCurrency, userAuth, testCreditCommonsNeighbour } from "../server/api.data"

describe('send', async () => {

  // This calls /TEST/creditCommonsNodes and adds a trunkward neighbour 'trunk' with last-hash 'trunk':
  const t = setupServerTest(true, true, 100000)

  logger.level = "debug"
  const eAdminAuth = userAuth("10")
  const eUser1Auth = userAuth("11")

  let eCurrency: any
  let eAccount1: any
  let eVostro: any
  
  it('Allows trunk/EXTR0000 to  send to trunk/branch2/TEST0002', async () => {
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

    // Send a transaction:
    const transfer = {
      type: "transfers",
      attributes: {
        amount: 1000, //0.1 EXTR,
        meta: {
          description: "Test transfer from trunk/EXTR0000 to trunk/branch2/TEST0002",
          creditCommons: {
            payeeAddress: `trunk/branch2/TEST0002`
          }
        },
        state: "committed"

      },
      relationships: {
        payer: { data: { type: "accounts", id: eAccount1.id } },
      }
    }
    const result = await t.api.post(`/EXTR/transfers`, { data: transfer }, eUser1Auth)
    assert.equal(result.status, 201)
    const body = result.body.data
    assert.equal(body.attributes.amount, 1000)
    assert.equal(body.attributes.meta.description, "Test transfer from trunk/EXTR0000 to trunk/branch2/TEST0002")
    assert.equal(body.attributes.meta.creditCommons?.payeeAddress, "trunk/branch2/TEST0002")
    assert.equal(body.relationships.payer.data.id, eAccount1.id)
    assert.equal(body.relationships.payee.data.id, eVostro.id)

  })
})