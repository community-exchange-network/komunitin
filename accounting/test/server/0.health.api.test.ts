import { describe, it } from "node:test"
import request from "supertest"
import { setupServerTest } from "./setup"

describe("Health endpoint", () => {
  const t = setupServerTest(false)

  it("returns 200", async () => {
    await request(t.app)
      .get('/health')
      .expect('Content-Type', /application\/json/)
      .expect(200, { status: 'ok' })
  })
})
