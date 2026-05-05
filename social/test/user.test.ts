import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { signJwt } from './mocks/auth'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { uuid } from './mocks/utils'
import { mockDb, resetDb } from './mocks/prisma'

let app: any

before(async () => {
  const server = await setupTestServer()
  app = server.app
  mockDb()
})

after(async () => {
  await teardownTestServer()
})

describe('Users endpoints', () => {
  beforeEach(() => {
    resetDb()
  })

  test('POST /users requires JWT', async () => {
    await request(app)
      .post('/users')
      .send({ data: { type: 'users', attributes: { email: 'x@example.org' } } })
      .expect(401)
  })

  test('POST /users creates authenticated user with optional settings include', async () => {
    const subject = uuid('1')
    const token = await signJwt(subject, 'first@example.org')

    const res = await request(app)
      .post('/users?include=settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'users',
          attributes: {
            name: 'Alice',
            email: 'alice@example.org',
          }
        },
        included: [{
          type: 'user-settings',
          attributes: {
            language: 'en',
            notifications: { myAccount: true, group: false },
            emails: { myAccount: true, group: 'weekly' },
          }
        }]
      })
      .expect(200)

    assert.strictEqual(res.body.data.type, 'users')
    assert.strictEqual(res.body.data.id, subject)
    assert.strictEqual(res.body.data.attributes.email, 'alice@example.org')
    assert.strictEqual(res.body.data.attributes.name, 'Alice')
    assert.ok(Array.isArray(res.body.included))
    assert.strictEqual(res.body.included[0].type, 'user-settings')
    assert.strictEqual(res.body.included[0].attributes.language, 'en')
  })

  test('POST /users rejects credential fields', async () => {
    const subject = uuid('2')
    const token = await signJwt(subject, 'second@example.org')

    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'users',
          attributes: {
            email: 'second@example.org',
            password: 'secret123'
          }
        }
      })
      .expect(400)
  })

  test('GET /users/me returns authenticated user', async () => {
    const subject = uuid('3')
    const token = await signJwt(subject, 'third@example.org')

    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'users',
          attributes: {
            name: 'Third User',
            email: 'third@example.org',
          }
        }
      })
      .expect(200)

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(res.body.data.id, subject)
    assert.strictEqual(res.body.data.attributes.email, 'third@example.org')
  })

  test('GET /users/:id denies cross-user access', async () => {
    const ownerSubject = uuid('4')
    const otherSubject = uuid('5')
    const ownerToken = await signJwt(ownerSubject, 'owner@example.org')
    const otherToken = await signJwt(otherSubject, 'other@example.org')

    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: {
          type: 'users',
          attributes: { email: 'owner@example.org' }
        }
      })
      .expect(200)

    await request(app)
      .get(`/users/${ownerSubject}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403)
  })

  test('GET /users/:id returns self user', async () => {
    const subject = uuid('6')
    const token = await signJwt(subject, 'self@example.org')

    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'users',
          attributes: {
            email: 'self@example.org',
            name: 'Self User'
          }
        }
      })
      .expect(200)

    const res = await request(app)
      .get(`/users/${subject}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(res.body.data.id, subject)
    assert.strictEqual(res.body.data.attributes.name, 'Self User')
  })
})
