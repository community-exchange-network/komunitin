import { after, before, describe, test } from 'node:test'
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
  test('GET /health returns 200', async () => {
    await request(app)
      .get('/health')
      .expect('Content-Type', /application\/json/)
      .expect(200, { status: 'ok' })
  })
})
