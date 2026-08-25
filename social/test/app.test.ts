import { after, before, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { setupTestServer, teardownTestServer } from './mocks/server'
import prisma from '../src/utils/prisma'

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

    assert.deepStrictEqual(res.body, { status: 'ok' })
    assert.match(res.headers['content-type'], /^application\/json/)
  })

  test('GET /health returns 503 with status error when DB is down', async (t) => {
    const queryRaw = prisma.$queryRaw

    t.after(() => {
      prisma.$queryRaw = queryRaw
    })

    prisma.$queryRaw = (async () => {
      throw new Error('DB is down')
    }) as typeof prisma.$queryRaw

    const res = await request(app)
      .get('/health')
      .expect(503)
    assert.deepStrictEqual(res.body, { status: 'error' })
    assert.match(res.headers['content-type'], /^application\/json/)
  })
})
