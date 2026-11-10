import assert from "node:assert"
import { describe, it } from "node:test"
import { setupServerTest } from "./setup"

describe("Health endpoint", () => {
  const t = setupServerTest(false)

  it("returns 200 when PostgreSQL is available", async () => {
    const response = await t.api.get("/health", undefined, 200, "application/json")

    assert.deepEqual(response.body, { status: "ok" })
  })

  it("returns 503 when PostgreSQL is unavailable", async (test) => {
    const service = t.app.komunitin.service
    test.mock.method(service, 'privilegedDb', () => {
      throw new Error("Database unavailable")
    })

    const response = await t.api.get("/health", undefined, 503, "application/json")

    assert.deepEqual(response.body, { status: "error" })
  })
})
