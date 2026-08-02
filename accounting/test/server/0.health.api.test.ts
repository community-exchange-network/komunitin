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
    const db = service.privilegedDb()
    const privilegedDb = service.privilegedDb
    const queryRaw = db.$queryRaw

    test.after(() => {
      db.$queryRaw = queryRaw
      service.privilegedDb = privilegedDb
    })

    db.$queryRaw = (async () => {
      throw new Error("Database unavailable")
    }) as typeof db.$queryRaw
    service.privilegedDb = () => db

    const response = await t.api.get("/health", undefined, 503, "application/json")

    assert.deepEqual(response.body, { status: "error" })
  })
})
