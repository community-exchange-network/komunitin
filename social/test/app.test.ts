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
  test('GET /health returns 200', async () => {
    await request(app)
      .get('/health')
      .expect(200)
  })

  test('GET /health returns 503 when the database is unavailable', async (t) => {
    const findFirst = prisma.user.findFirst
    t.after(() => { prisma.user.findFirst = findFirst })
    prisma.user.findFirst = () => { throw new Error('Database unavailable') }

    await request(app)
      .get('/health')
      .expect(503)
  })
})
