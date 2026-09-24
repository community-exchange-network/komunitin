import { after, before, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { setupTestServer, teardownTestServer } from './mocks/server'

let app: any

before(async () => {
  const server = await setupTestServer()
  app = server.app
})

after(async () => {
  await teardownTestServer()
})

describe('Health endpoint', () => {
  test('GET /health returns 200 with status ok', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200)

    assert.strictEqual(res.body.status, 'ok')
    assert.ok(res.headers['content-type']?.includes('application/vnd.api+json'))
  })
})
