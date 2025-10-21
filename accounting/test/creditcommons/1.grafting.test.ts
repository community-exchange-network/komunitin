import {describe, it} from "node:test"
import assert from "node:assert"
import { setupServerTest } from "../server/setup"
import { userAuth, testCreditCommonsNeighbour } from "../server/api.data"

describe('grafting', async () => {
  // This sets up the server with the TEST currency but doesn't add a trunkward neighbour:
  const t = setupServerTest(true)

  const testNodeData = testCreditCommonsNeighbour({
    peerNodePath: 'trunk',
    ourNodePath: 'trunk/branch2',
    lastHash: 'asdf',
    url: 'http://branch2.example.com',
    vostroId: t.account0.id
  })

  it('is required', async () => {
    const response = await t.api.get(
      "/TEST/cc/",
      { user: null, scopes: [], ccNode: 'trunk', lastHash: 'asdf' },
      401)
    // note that this error will come from a CC API route:
    assert.equal(response.text, '{"errors":["This currency has not (yet) been grafted onto any CreditCommons tree."]}')
  })
  it('requires authn', async () => {
    const response = await t.api.post(
      "/TEST/cc/nodes",
      testNodeData,
      { user: null, scopes: [], ccNode: 'trunk', lastHash: 'asdf' },
      403)
    // note that this error will come from a CC admin route:
    assert.equal(response.text, '{"errors":[{"status":"403","code":"Forbidden","title":"Forbidden","detail":"Insufficient Scope"}]}')
  })
  it('requires admin', async () => {
    const response = await t.api.post(
      "/TEST/cc/nodes",
      testNodeData,
      userAuth("1"),
      403)
    assert.equal(response.text, '{"errors":[{"status":"403","code":"Forbidden","title":"Forbidden","detail":"Only the currency owner can perform this operation"}]}')
  })
  it('can be done', async () => {
    const response = await t.api.post(
      "/TEST/cc/nodes",
      testNodeData,
      userAuth("0"),
      201)
    assert.equal(response.text, `{"data":{"type":"creditCommonsNodes","attributes":{"peerNodePath":"trunk","lastHash":"asdf","vostroId":"${t.account0.id}"}}}`)
  })

})
