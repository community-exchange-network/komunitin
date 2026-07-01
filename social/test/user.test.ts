import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { Scope } from '../src/server/context'
import { signJwt } from './mocks/auth'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { toUuid } from './mocks/utils'
import { resetDb, seedGroup, seedMember, seedMemberUser, seedUser } from './mocks/seed'

let app: any

before(async () => {
  const server = await setupTestServer()
  app = server.app
})

after(async () => {
  await teardownTestServer()
})

describe('Users endpoints', () => {
  beforeEach(async () => {
    await resetDb()
  })

  test('POST /users requires JWT', async () => {
    await request(app)
      .post('/users')
      .send({ data: { type: 'users', attributes: { email: 'x@example.org' } } })
      .expect(401)
  })

  test('POST /users creates authenticated user with optional settings include', async () => {
    const subject = toUuid('1')
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
    const subject = toUuid('2')
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
    const subject = toUuid('3')
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
    const ownerSubject = toUuid('4')
    const otherSubject = toUuid('5')
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
    const subject = toUuid('6')
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

  test('GET /users allows read-all scope with filter[members] and include=settings', async () => {
    const tenantId = 'users-filter-members'
    await seedGroup({ tenantId, status: 'active', access: 'public' })

    const member = await seedMember({
      tenantId,
      status: 'active',
      access: 'public',
    })

    const linkedUser = await seedUser({
      id: 'linked-user',
    })

    await seedMemberUser({
      tenantId,
      memberId: member.id,
      userId: linkedUser.id,
    })

    await seedUser({
      id: linkedUser.id,
      email: 'linked@example.org',
      name: 'Linked User',
      settings: {
        language: 'en',
        notifications: { myAccount: true, group: true },
        emails: { myAccount: false, group: 'weekly' },
      },
    })

    const serviceToken = await signJwt(toUuid('service-user'), 'service@example.org', Scope.SocialReadAll)

    const res = await request(app)
      .get(`/users?filter[members]=${member.id}&include=settings`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200)

    assert.strictEqual(Array.isArray(res.body.data), true)
    assert.strictEqual(res.body.data.some((resource: any) => resource.id === linkedUser.id), true)
    const linkedUserResource = res.body.data.find((resource: any) => resource.id === linkedUser.id)
    assert.strictEqual(linkedUserResource.type, 'users')
    assert.strictEqual(linkedUserResource.attributes.email, 'linked@example.org')

    assert.strictEqual(Array.isArray(res.body.included), true)
    const linkedSettings = res.body.included.find((resource: any) => resource.type === 'user-settings' && resource.id === linkedUser.id)
    assert.ok(linkedSettings)
    assert.strictEqual(linkedSettings.attributes.language, 'en')
  })

  test('GET /users paginates unique users when one user belongs to multiple filtered members', async () => {
    const tenantId = 'users-filter-members-unique'
    const duplicateUserId = toUuid('duplicate-member-user')
    const uniqueUserId = toUuid('unique-member-user')

    await seedGroup({ tenantId, status: 'active', access: 'public' })
    const firstMember = await seedMember({
      tenantId,
      status: 'active',
      access: 'public',
      userId: duplicateUserId,
    })
    const secondMember = await seedMember({
      tenantId,
      status: 'active',
      access: 'public',
      userId: duplicateUserId,
    })

    await seedUser({
      id: uniqueUserId,
      email: 'unique-member-user@example.org',
    })
    await seedMemberUser({
      tenantId,
      memberId: secondMember.id,
      userId: uniqueUserId,
    })

    const serviceToken = await signJwt(toUuid('service-user-pagination'), 'service-pagination@example.org', Scope.SocialReadAll)
    const memberFilter = `${firstMember.id},${secondMember.id}`

    const res = await request(app)
      .get(`/users?filter[members]=${memberFilter}&sort=created&page[size]=2`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200)

    const ids = res.body.data.map((resource: any) => resource.id)
    assert.deepStrictEqual(ids, [duplicateUserId, uniqueUserId])
  })

  test('GET /users requires read-all scope', async () => {
    const token = await signJwt(toUuid('regular-user'), 'regular@example.org')

    await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })

  test('GET /users/:id allows read-all scope cross-user access', async () => {
    const ownerSubject = toUuid('owner-user')
    const ownerToken = await signJwt(ownerSubject, 'owner-2@example.org')
    const serviceToken = await signJwt(toUuid('service-user-2'), 'service-2@example.org', Scope.SocialReadAll)

    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        data: {
          type: 'users',
          attributes: {
            email: 'owner-2@example.org',
            name: 'Owner 2',
          }
        }
      })
      .expect(200)

    const res = await request(app)
      .get(`/users/${ownerSubject}`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200)

    assert.strictEqual(res.body.data.id, ownerSubject)
    assert.strictEqual(res.body.data.attributes.email, 'owner-2@example.org')
  })
})
