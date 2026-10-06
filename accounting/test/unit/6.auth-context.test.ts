import assert from "node:assert"
import { describe, it } from "node:test"
import { Scope } from "../../src/server/auth"
import { context } from "../../src/utils/context"

describe("Auth context", () => {
  it("uses the new accounting scopes", () => {
    assert.equal(Scope.AccountingRead, "accounting:read")
    assert.equal(Scope.AccountingWrite, "accounting:write")
  })

  it("recognizes client-credentials tokens as system requests", () => {
    const req = {
      auth: {
        payload: {
          sub: "komunitin-notifications",
          client_id: "komunitin-notifications",
          scope: Scope.AccountingRead,
        },
      },
    }

    assert.deepEqual(context(req as any), { type: "system" })
  })
})
