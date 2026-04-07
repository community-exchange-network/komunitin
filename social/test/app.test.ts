import { test, describe, before, after } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { app } from '../src/app'

describe('Health endpoint', () => {
  before(() => {
    // No external dependencies needed for the health endpoint.
  })

  after(() => {
    // Nothing to tear down.
  })

  test('GET /health returns 200 with status ok', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200)

    assert.strictEqual(res.body.status, 'ok')
  })

  test('GET /health returns application/vnd.api+json content type', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200)

    assert.ok(
      res.headers['content-type']?.includes('application/vnd.api+json'),
      `Expected content-type to include application/vnd.api+json, got: ${res.headers['content-type']}`
    )
  })

  test('GET /unknown returns 404', async () => {
    await request(app)
      .get('/unknown-route')
      .expect(404)
  })
})
