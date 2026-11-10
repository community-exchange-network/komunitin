import { after, before, describe, test } from 'node:test'
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
    await request(app)
      .get('/health')
      .expect('Content-Type', /^application\/json/)
      .expect(200, { status: 'ok' })
  })

  test('GET /health returns 503 with status error when DB is down', async (t) => {
    const queryRaw = prisma.$queryRaw
    t.after(() => { prisma.$queryRaw = queryRaw })
    prisma.$queryRaw = () => { throw new Error('Database unavailable') }

    await request(app)
      .get('/health')
      .expect('Content-Type', /^application\/json/)
      .expect(503, { status: 'error' })
  })
})
