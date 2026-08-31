import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { redeemUnsubscribeToken } from '../src/clients/auth'
import { config } from '../src/config'
import { Scope } from '../src/server/context'
import { serviceAuth, signJwt, signServiceJwt } from './mocks/auth'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { includedResource, toUuid } from './mocks/utils'
import { resetDb, seedGroup, seedMember, seedMemberUser, seedPost, seedUser } from './mocks/seed'
import { seedAuthUnsubscribeToken } from './mocks/handlers'
import { tenantDb } from '../src/server/multitenant'
import prisma from '../src/utils/prisma'

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

  test('GET /users/me rejects exchanged user tokens issued to the social client', async () => {
    const token = await signJwt(
      toUuid('social-exchanged-user'),
      'social-exchanged-user@example.org',
      Scope.SocialRead,
      { clientId: 'komunitin-social', includeDefaultScopes: false },
    )

    await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
  })

  test('service and superadmin identities cannot bypass the base social scope', async () => {
    const forgedService = await signServiceJwt(
      'komunitin-notifications',
      [Scope.SocialRead],
      'different-service-subject',
    )
    await request(app)
      .get('/scope-test/member-users')
      .set('Authorization', `Bearer ${forgedService}`)
      .expect(401)

    const superadminOnly = await signJwt(
      toUuid('scope-less-superadmin'),
      'scope-less-superadmin@example.org',
      Scope.Superadmin,
      { includeDefaultScopes: false },
    )
    await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${superadminOnly}`)
      .expect(403)
  })

  test('POST /users creates authenticated user with language', async () => {
    const subject = toUuid('1')
    const token = await signJwt(subject, 'first@example.org')

    const res = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'users',
          attributes: {
            name: 'Alice',
            email: 'alice@example.org',
            language: 'en',
          }
        },
      })
      .expect(200)

    assert.strictEqual(res.body.data.type, 'users')
    assert.strictEqual(res.body.data.id, subject)
    assert.strictEqual(res.body.data.attributes.email, 'alice@example.org')
    assert.strictEqual(res.body.data.attributes.name, 'Alice')
    assert.strictEqual(res.body.data.attributes.language, 'en')
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

  test('POST /users rejects user-settings includes', async () => {
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

    await request(app)
      .post('/users?include=settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'users',
          attributes: { email: 'third@example.org' },
        },
        included: [{ type: 'user-settings', attributes: {} }],
      })
      .expect(400)
  })

  test('GET /users/me returns language and rejects includes', async () => {
    const subject = toUuid('me-include-settings')
    const token = await signJwt(subject, 'me-include-settings@example.org')

    await seedUser({
      id: subject,
      email: 'me-include-settings@example.org',
      language: 'ca',
    })

    const res = await request(app)
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(res.body.data.attributes.language, 'ca')

    await request(app)
      .get('/users/me?include=settings')
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
    assert.strictEqual(res.body.meta.count, 1)
    assert.strictEqual(typeof res.body.links.self, 'string')
    assert.ok(includedResource(res.body, 'groups'))
    assert.ok(includedResource(res.body, 'currencies', currencyId))
    assert.ok(includedResource(res.body, 'accounts', accountId))
  })

  test('GET /users/:id/members includes visible published post counts', async () => {
    const subject = toUuid('member-post-count-user')
    const token = await signJwt(subject, 'member-post-count-user@example.org')

    const group = await seedGroup({
      tenantId: 'user-member-post-counts',
      status: 'active',
      access: 'public',
    })
    const member = await seedMember({
      tenantId: 'user-member-post-counts',
      userId: subject,
      status: 'active',
      access: 'public',
    })
    await seedPost({
      tenantId: 'user-member-post-counts',
      memberId: member.id,
      type: 'offers',
      status: 'published',
      access: 'public',
    })
    await seedPost({
      tenantId: 'user-member-post-counts',
      memberId: member.id,
      type: 'needs',
      status: 'draft',
      access: 'public',
    })

    const res = await request(app)
      .get(`/users/${subject}/members`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(res.body.data[0].relationships.offers.meta.count, 1)
    assert.strictEqual(res.body.data[0].relationships.needs.meta.count, 0)
    assert.deepStrictEqual(res.body.data[0].relationships.group.data, {
      type: 'groups',
      id: group.id,
    })
    assert.deepStrictEqual(res.body.included, [])
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

  test('PATCH /users/:id updates only the caller language', async () => {
    const subject = toUuid('language-patch-owner')
    const other = toUuid('language-patch-other')
    const token = await signJwt(subject, 'language-patch-owner@example.org')

    await seedUser({
      id: subject,
      email: 'language-patch-owner@example.org',
      language: 'en',
    })
    await seedUser({ id: other, email: 'language-patch-other@example.org' })

    const payload = {
      data: {
        type: 'users',
        attributes: { language: 'ca' },
      },
    }

    await request(app)
      .patch(`/users/${other}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(403)

    await request(app)
      .patch(`/users/${subject}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          ...payload.data,
          id: other,
        },
      })
      .expect(400)

    const unchanged = await request(app)
      .get(`/users/${subject}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
    assert.strictEqual(unchanged.body.data.attributes.language, 'en')

    const res = await request(app)
      .patch(`/users/${subject}`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(200)

    assert.strictEqual(res.body.data.type, 'users')
    assert.strictEqual(res.body.data.attributes.language, 'ca')
  })

  test('PATCH /users/:id rejects preference attributes and old settings routes are gone', async () => {
    const subject = toUuid('language-patch-validation')
    const token = await signJwt(subject, 'language-patch-validation@example.org')
    await seedUser({ id: subject, email: 'language-patch-validation@example.org' })

    await request(app)
      .patch(`/users/${subject}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'users',
          attributes: { notifications: { group: false } },
        },
      })
      .expect(400)

    await request(app)
      .get(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)

    await request(app)
      .patch(`/users/${subject}/settings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { type: 'user-settings', attributes: {} } })
      .expect(404)
  })

  test('POST /users/unsubscribe disables newsletters across every tenant relation', async () => {
    const userId = toUuid('unsubscribe-user')
    const token = 'valid-unsubscribe-token'
    await seedUser({
      id: userId,
      email: 'unsubscribe-user@example.org',
      language: 'ca',
    })
    await seedGroup({ tenantId: 'unsubscribe-one', status: 'active' })
    await seedGroup({ tenantId: 'unsubscribe-two', status: 'active' })
    const firstMember = await seedMember({ tenantId: 'unsubscribe-one' })
    const secondMember = await seedMember({ tenantId: 'unsubscribe-two' })
    const first = await seedMemberUser({
      tenantId: 'unsubscribe-one',
      memberId: firstMember.id,
      userId,
      settings: {
        notifications: { myAccount: false, group: true },
        emails: { myAccount: false, group: 'weekly' },
      },
    })
    const second = await seedMemberUser({
      tenantId: 'unsubscribe-two',
      memberId: secondMember.id,
      userId,
      settings: {
        notifications: { myAccount: true, group: false },
        emails: { myAccount: true, group: 'monthly' },
      },
    })
    seedAuthUnsubscribeToken(token, userId, 'unsubscribe-user@example.org')

    await request(app)
      .post(`/users/unsubscribe?token=${token}`)
      .expect(204)

    assert.deepStrictEqual((await tenantDb(prisma, 'unsubscribe-one').memberUser.findUniqueOrThrow({
      where: { id: first.id },
    })).settings, {
      notifications: { myAccount: false, group: true },
      emails: { myAccount: false, group: 'never' },
    })
    assert.deepStrictEqual((await tenantDb(prisma, 'unsubscribe-two').memberUser.findUniqueOrThrow({
      where: { id: second.id },
    })).settings, {
      notifications: { myAccount: true, group: false },
      emails: { myAccount: true, group: 'never' },
    })

    await request(app)
      .post(`/users/unsubscribe?token=${token}`)
      .expect(204)

    assert.deepStrictEqual((await tenantDb(prisma, 'unsubscribe-one').memberUser.findUniqueOrThrow({
      where: { id: first.id },
    })).settings, {
      notifications: { myAccount: false, group: true },
      emails: { myAccount: false, group: 'never' },
    })

    const userToken = await signJwt(userId, 'unsubscribe-user@example.org')
    const user = await request(app)
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200)
    assert.strictEqual(user.body.data.attributes.language, 'ca')
  })

  test('POST /users/unsubscribe rolls back every relation when one update fails', async () => {
    const userId = toUuid('unsubscribe-atomic-user')
    const token = 'atomic-unsubscribe-token'
    await seedUser({ id: userId, email: 'unsubscribe-atomic@example.org' })
    await seedGroup({ tenantId: 'unsubscribe-atomic-one', status: 'active' })
    await seedGroup({ tenantId: 'unsubscribe-atomic-two', status: 'active' })
    const firstMember = await seedMember({ tenantId: 'unsubscribe-atomic-one' })
    const secondMember = await seedMember({ tenantId: 'unsubscribe-atomic-two' })
    const first = await seedMemberUser({
      tenantId: 'unsubscribe-atomic-one',
      memberId: firstMember.id,
      userId,
      settings: {
        notifications: { myAccount: true, group: true },
        emails: { myAccount: true, group: 'weekly' },
      },
    })
    const second = await seedMemberUser({
      tenantId: 'unsubscribe-atomic-two',
      memberId: secondMember.id,
      userId,
      settings: {
        notifications: { myAccount: true, group: true },
        emails: { myAccount: true, group: 'monthly' },
      },
    })
    seedAuthUnsubscribeToken(token, userId, 'unsubscribe-atomic@example.org')

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION test_fail_second_unsubscribe_update() RETURNS trigger AS $$
      BEGIN
        IF current_setting('test.unsubscribe_update_seen', TRUE) = 'yes' THEN
          RAISE EXCEPTION 'forced second unsubscribe update failure';
        END IF;
        PERFORM set_config('test.unsubscribe_update_seen', 'yes', TRUE);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER test_fail_second_unsubscribe_update
      BEFORE UPDATE OF settings ON "MemberUser"
      FOR EACH ROW EXECUTE FUNCTION test_fail_second_unsubscribe_update();
    `)

    try {
      await request(app)
        .post(`/users/unsubscribe?token=${token}`)
        .expect(500)
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER test_fail_second_unsubscribe_update ON "MemberUser"',
      )
      await prisma.$executeRawUnsafe('DROP FUNCTION test_fail_second_unsubscribe_update()')
    }

    assert.deepStrictEqual((await tenantDb(prisma, 'unsubscribe-atomic-one').memberUser.findUniqueOrThrow({
      where: { id: first.id },
    })).settings, first.settings)
    assert.deepStrictEqual((await tenantDb(prisma, 'unsubscribe-atomic-two').memberUser.findUniqueOrThrow({
      where: { id: second.id },
    })).settings, second.settings)
  })

  test('POST /users/unsubscribe does not disclose a missing social projection', async () => {
    const token = 'unsubscribe-without-social-user'
    seedAuthUnsubscribeToken(token, toUuid('auth-only-user'), 'auth-only@example.org')

    await request(app)
      .post(`/users/unsubscribe?token=${token}`)
      .expect(204)
  })

  test('POST /users/unsubscribe can retry after Auth resolution precedes a failed Social mutation', async () => {
    const userId = toUuid('unsubscribe-retry')
    const token = 'retryable-unsubscribe-token'
    await seedUser({
      id: userId,
      email: 'unsubscribe-retry@example.org',
    })
    await seedGroup({ tenantId: 'unsubscribe-retry', status: 'active' })
    const member = await seedMember({ tenantId: 'unsubscribe-retry' })
    const relation = await seedMemberUser({
      tenantId: 'unsubscribe-retry',
      memberId: member.id,
      userId,
      settings: {
        notifications: { myAccount: true, group: true },
        emails: { myAccount: true, group: 'weekly' },
      },
    })
    seedAuthUnsubscribeToken(token, userId, 'unsubscribe-retry@example.org')

    // Simulate losing the operation after Auth resolves the token but before Social writes.
    await redeemUnsubscribeToken(token)

    await request(app)
      .post(`/users/unsubscribe?token=${token}`)
      .expect(204)

    const updated = await tenantDb(prisma, 'unsubscribe-retry').memberUser.findUniqueOrThrow({
      where: { id: relation.id },
    })
    assert.deepStrictEqual(updated.settings, {
      notifications: { myAccount: true, group: true },
      emails: { myAccount: true, group: 'never' },
    })
  })

  test('POST /users/unsubscribe rejects missing and unknown tokens', async () => {
    await request(app)
      .post('/users/unsubscribe')
      .expect(400)

    await request(app)
      .post('/users/unsubscribe?token=unknown')
      .expect(400)
  })
})
