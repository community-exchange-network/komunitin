import { describe, it } from "node:test"
import request from "supertest"
import { setupServerTest } from "./setup"

describe("Health endpoint", () => {
  const t = setupServerTest(false)

  it("returns 200 when PostgreSQL is available", async () => {
    await request(t.app).get('/health').expect(200)
  })

  it("returns 503 when PostgreSQL is unavailable", async (test) => {
    const service = t.app.komunitin.service
    test.mock.method(service, 'privilegedDb', () => {
      throw new Error("Database unavailable")
    })

    await request(t.app).get('/health').expect(503)
  })
})
