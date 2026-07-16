import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { config } from '../src/config'
import { Scope } from '../src/server/context'
import { serviceAuth, signJwt } from './mocks/auth'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { includedResource, toUuid } from './mocks/utils'
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

  test('POST /users rejects a read-only social scope', async () => {
    const token = await signJwt(
      toUuid('read-only-user'),
      'read-only@example.org',
      'social:read',
      { includeDefaultScopes: false },
    )

    await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { type: 'users', attributes: { email: 'read-only@example.org' } } })
      .expect(403)
  })

  test('GET /users/me requires the exact new issuer and audience', async () => {
    const subject = toUuid('legacy-trust-user')
    const issuerToken = await signJwt(subject, 'issuer@example.org', undefined, {
      issuer: `${config.AUTH_JWT_ISSUER}/ca`,
    })
    const audienceToken = await signJwt(subject, 'audience@example.org', undefined, {
      audience: 'komunitin-app',
    })

    await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${issuerToken}`)
      .expect(401)

    await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${audienceToken}`)
      .expect(401)
  })

  test('GET /users/me rejects non-UUID user subjects', async () => {
    const token = await signJwt('123', 'numeric-subject@example.org')

    await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
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

  test('GET /users/me supports settings include but rejects members include', async () => {
    const subject = toUuid('me-include-settings')
    const token = await signJwt(subject, 'me-include-settings@example.org')

    await seedUser({
      id: subject,
      email: 'me-include-settings@example.org',
      settings: {
        language: 'ca',
      },
    })

    const res = await request(app)
      .get('/users/me?include=settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.ok(includedResource(res.body, 'user-settings', subject))

    await request(app)
      .get('/users/me?include=members')
      .set('Authorization', `Bearer ${token}`)
      .expect(400)
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

  test('GET /users allows service read access with filter[members] and include=settings', async () => {
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

    const { token: serviceToken } = await serviceAuth()

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

    const { token: serviceToken } = await serviceAuth()
    const memberFilter = `${firstMember.id},${secondMember.id}`

    const res = await request(app)
      .get(`/users?filter[members]=${memberFilter}&sort=created&page[size]=2`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200)

    const ids = res.body.data.map((resource: any) => resource.id)
    assert.deepStrictEqual(ids, [duplicateUserId, uniqueUserId])
  })

  test('GET /users rejects regular user tokens', async () => {
    const token = await signJwt(toUuid('regular-user'), 'regular@example.org')

    await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403)
  })

  test('GET /users/:id allows service cross-user access', async () => {
    const ownerSubject = toUuid('owner-user')
    const ownerToken = await signJwt(ownerSubject, 'owner-2@example.org')
    const { token: serviceToken } = await serviceAuth()

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

  test('GET /users/:id/members returns paginated members with to-one includes', async () => {
    const subject = toUuid('bootstrap-member-user')
    const token = await signJwt(subject, 'bootstrap-member-user@example.org')
    const currencyId = toUuid('bootstrap-currency')
    const accountId = toUuid('bootstrap-account')

    await seedGroup({
      tenantId: 'bootstrap-members',
      status: 'active',
      access: 'public',
      currencyId,
    })
    const member = await seedMember({
      tenantId: 'bootstrap-members',
      userId: subject,
      accountId,
      status: 'pending',
      access: 'private',
      name: 'Bootstrap Member',
    })

    const res = await request(app)
      .get(`/users/${subject}/members?page[size]=1&include=group,group.currency,account`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(Array.isArray(res.body.data), true)
    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].type, 'members')
    assert.strictEqual(res.body.data[0].id, member.id)
    assert.strictEqual(typeof res.body.links.self, 'string')
    assert.ok(includedResource(res.body, 'groups'))
    assert.ok(includedResource(res.body, 'currencies', currencyId))
    assert.ok(includedResource(res.body, 'accounts', accountId))
  })

  test('GET /users/:id/members denies outsiders', async () => {
    const ownerSubject = toUuid('member-owner')
    const outsiderToken = await signJwt(toUuid('member-outsider'), 'member-outsider@example.org')

    await seedGroup({
      tenantId: 'members-outsider',
      status: 'active',
      access: 'public',
    })
    await seedMember({
      tenantId: 'members-outsider',
      userId: ownerSubject,
      status: 'active',
      access: 'public',
    })

    await request(app)
      .get(`/users/${ownerSubject}/members`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403)
  })

  test('GET /users/:id/members allows service access and superadmin', async () => {
    const ownerSubject = toUuid('member-service-owner')
    const { token: serviceToken } = await serviceAuth()
    const superadminToken = await signJwt(toUuid('member-superadmin'), 'member-superadmin@example.org', Scope.Superadmin)

    await seedGroup({
      tenantId: 'members-service',
      status: 'active',
      access: 'public',
    })
    const member = await seedMember({
      tenantId: 'members-service',
      userId: ownerSubject,
      status: 'active',
      access: 'public',
    })

    const serviceRes = await request(app)
      .get(`/users/${ownerSubject}/members`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200)

    assert.strictEqual(serviceRes.body.data[0].id, member.id)

    const superadminRes = await request(app)
      .get(`/users/${ownerSubject}/members`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(200)

    assert.strictEqual(superadminRes.body.data[0].id, member.id)
  })

  test('GET /users/:id/settings enforces read permissions', async () => {
    const subject = toUuid('settings-owner')
    const token = await signJwt(subject, 'settings-owner@example.org')
    const outsiderToken = await signJwt(toUuid('settings-outsider'), 'settings-outsider@example.org')
    const { token: serviceToken } = await serviceAuth()
    const superadminToken = await signJwt(toUuid('settings-superadmin'), 'settings-superadmin@example.org', Scope.Superadmin)

    await seedUser({
      id: subject,
      email: 'settings-owner@example.org',
      settings: {
        language: 'es',
      },
    })

    const selfRes = await request(app)
      .get(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(selfRes.body.data.type, 'user-settings')
    assert.strictEqual(selfRes.body.data.id, subject)
    assert.strictEqual(selfRes.body.data.attributes.language, 'es')

    await request(app)
      .get(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .expect(200)

    await request(app)
      .get(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(200)

    await request(app)
      .get(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403)
  })

  test('PATCH /users/:id/settings is self-only and deep-merges nested settings', async () => {
    const subject = toUuid('settings-patch-owner')
    const token = await signJwt(subject, 'settings-patch-owner@example.org')
    const { token: serviceToken } = await serviceAuth()

    await seedUser({
      id: subject,
      email: 'settings-patch-owner@example.org',
      settings: {
        language: 'en',
        notifications: {
          myAccount: true,
          group: false,
        },
        emails: {
          myAccount: true,
          group: 'weekly',
        },
      },
    })

    await request(app)
      .patch(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${serviceToken}`)
      .send({
        data: {
          type: 'user-settings',
          attributes: {
            language: 'ca',
          },
        },
      })
      .expect(403)

    const res = await request(app)
      .patch(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'user-settings',
          attributes: {
            notifications: {
              group: true,
            },
            emails: {
              group: 'monthly',
            },
          },
        },
      })
      .expect(200)

    assert.strictEqual(res.body.data.id, subject)
    assert.strictEqual(res.body.data.attributes.language, 'en')
    assert.deepStrictEqual(res.body.data.attributes.notifications, {
      myAccount: true,
      group: true,
    })
    assert.deepStrictEqual(res.body.data.attributes.emails, {
      myAccount: true,
      group: 'monthly',
    })
  })

  test('PATCH /users/:id/settings validates request body', async () => {
    const subject = toUuid('settings-patch-validation')
    const token = await signJwt(subject, 'settings-patch-validation@example.org')

    await seedUser({
      id: subject,
      email: 'settings-patch-validation@example.org',
    })

    await request(app)
      .patch(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'user-settings',
          attributes: {
            emails: {
              group: 'daily',
            },
          },
        },
      })
      .expect(400)
  })
})
