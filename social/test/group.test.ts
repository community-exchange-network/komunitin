import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { Scope } from '../src/server/auth'
import { signJwt } from './mocks/auth'
import { mockDb, resetDb } from './mocks/prisma'
import { MockDatabase, seedGroup, seedGroupAdmin, seedMember } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'

let app: any
let db: MockDatabase

const auth = async (subject: string, email: string, scope?: string | string[]) => {
  const token = await signJwt(subject, email, scope)
  return { subject, token }
}

const postGroup = (
  token: string,
  code: string,
  options?: {
    includeSettings?: boolean
  },
) => {
  const query = options?.includeSettings ? '?include=settings' : ''

  const payload: any = {
    data: {
      type: 'groups',
      attributes: {
        code,
        name: `Group ${code}`,
      }
    }
  }

  if (options?.includeSettings) {
    payload.included = [{
      type: 'group-settings',
      attributes: {
        requireAcceptTerms: true,
        defaultGroupEmailFrequency: 'weekly',
      }
    }]
  }

  return request(app)
    .post(`/groups${query}`)
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
}

before(async () => {
  const server = await setupTestServer()
  app = server.app
  db = mockDb()
})

after(async () => {
  await teardownTestServer()
})

describe('Groups endpoints', () => {
  beforeEach(() => {
    resetDb()
  })

  test('POST /groups requires JWT', async () => {
    await request(app)
      .post('/groups')
      .send({
        data: {
          type: 'groups',
          attributes: {
            code: 'unauthorized-group',
            name: 'Unauthorized Group',
          }
        }
      })
      .expect(401)
  })

  test('POST /groups creates pending group with optional settings include', async () => {
    const { subject, token } = await auth('user-1', 'owner@example.org')

    const res = await postGroup(token, 'alpha-group', { includeSettings: true })
      .expect(201)

    assert.strictEqual(res.body.data.type, 'groups')
    assert.strictEqual(res.body.data.attributes.code, 'alpha-group')
    assert.strictEqual(res.body.data.attributes.status, 'pending')
    assert.ok(Array.isArray(res.body.included))
    assert.strictEqual(res.body.included[0].type, 'group-settings')
    assert.strictEqual(res.body.included[0].attributes.requireAcceptTerms, true)

    const adminView = await request(app)
      .get('/alpha-group')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(adminView.body.data.attributes.code, 'alpha-group')
    assert.strictEqual(adminView.body.data.attributes.status, 'pending')
    assert.ok(adminView.body.data.id.length > 0)
    assert.ok(subject.length > 0)

    const { token: superadminToken } = await auth('superadmin-1', 'owner-superadmin@example.org', Scope.Superadmin)
    await request(app)
      .get('/alpha-group')
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(200)

    const { token: outsiderToken } = await auth('outsider-1', 'owner-outsider@example.org')
    await request(app)
      .get('/alpha-group')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403)
  })

  test('POST /groups rejects duplicate code', async () => {
    const { token } = await auth('user-2', 'duplicated@example.org')

    await postGroup(token, 'dupe-code').expect(201)
    await postGroup(token, 'dupe-code').expect(400)
  })

  test('GET /groups returns only active public groups', async () => {
    seedGroup(db, { tenantId: 'public-active', status: 'active', access: 'public' })
    seedGroup(db, { tenantId: 'public-pending', status: 'pending', access: 'public' })
    seedGroup(db, { tenantId: 'group-active', status: 'active', access: 'group' })
    seedGroup(db, { tenantId: 'private-active', status: 'active', access: 'private' })
    seedGroup(db, { tenantId: 'admin-owned', status: 'pending', access: 'private' })

    const anonymous = await request(app)
      .get('/groups')
      .expect(200)

    assert.strictEqual(Array.isArray(anonymous.body.data), true)
    assert.strictEqual(anonymous.body.data.length, 1)
    assert.strictEqual(anonymous.body.data[0].attributes.code, 'public-active')

    const { token } = await auth('user-3', 'any@example.org')
    const authenticated = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(authenticated.body.data.length, 1)
    assert.strictEqual(authenticated.body.data[0].attributes.code, 'public-active')

    const admin = await auth('admin-3', 'admin-own@example.org')
    seedGroupAdmin(db, { tenantId: 'admin-owned', userId: admin.subject })

    const adminResult = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    const adminCodes = adminResult.body.data.map((resource: any) => resource.attributes.code)
    assert.strictEqual(adminCodes.includes('public-active'), true)
    assert.strictEqual(adminCodes.includes('admin-owned'), true)

    const superadmin = await auth('superadmin-3', 'superadmin-all@example.org', Scope.Superadmin)
    const superadminResult = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)

    const superadminCodes = superadminResult.body.data.map((resource: any) => resource.attributes.code)
    assert.strictEqual(superadminCodes.length, 5)
    assert.strictEqual(superadminCodes.includes('public-active'), true)
    assert.strictEqual(superadminCodes.includes('public-pending'), true)
    assert.strictEqual(superadminCodes.includes('group-active'), true)
    assert.strictEqual(superadminCodes.includes('private-active'), true)
    assert.strictEqual(superadminCodes.includes('admin-owned'), true)
  })

  test('GET /groups?include=settings includes settings relationship data', async () => {
    seedGroup(db, {
      tenantId: 'settings-group',
      status: 'active',
      access: 'public',
      settings: { requireAcceptTerms: true },
    })

    const res = await request(app)
      .get('/groups?include=settings')
      .expect(200)

    assert.ok(Array.isArray(res.body.included))
    assert.strictEqual(res.body.included[0].type, 'group-settings')
    assert.strictEqual(res.body.included[0].attributes.requireAcceptTerms, true)
  })

  test('GET /:code allows anonymous access to active public groups', async () => {
    seedGroup(db, { tenantId: 'public-one', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/public-one')
      .expect(200)

    assert.strictEqual(res.body.data.type, 'groups')
    assert.strictEqual(res.body.data.attributes.code, 'public-one')
  })

  test('GET /:code allows group member and denies non-member for group access', async () => {
    seedGroup(db, { tenantId: 'member-group', status: 'active', access: 'group' })

    const member = await auth('user-5', 'member@example.org')
    seedMember(db, { tenantId: 'member-group', userId: member.subject })

    const memberResult = await request(app)
      .get('/member-group')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200)

    assert.strictEqual(memberResult.body.data.attributes.code, 'member-group')

    const outsider = await auth('user-6', 'outsider@example.org')
    await request(app)
      .get('/member-group')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    const admin = await auth('admin-6', 'member-group-admin@example.org')
    seedGroupAdmin(db, { tenantId: 'member-group', userId: admin.subject })
    await request(app)
      .get('/member-group')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    const superadmin = await auth('superadmin-6', 'member-group-superadmin@example.org', Scope.Superadmin)
    await request(app)
      .get('/member-group')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)
  })

  test('GET /:code returns 404 for missing group', async () => {
    await request(app)
      .get('/missing-group')
      .expect(404)
  })

  test('GET /:code/settings is public endpoint', async () => {
    seedGroup(db, { tenantId: 'settings-auth', status: 'active', access: 'public' })

    await request(app)
      .get('/settings-auth/settings')
      .expect(200)
  })

  test('GET /:code/settings allows admin and superadmin, denies others for pending public group', async () => {
    const { subject, token } = await auth('admin-8', 'settings-admin@example.org')
    seedGroup(db, {
      tenantId: 'settings-admin-group',
      status: 'pending',
      access: 'public',
      settings: { enableGroupEmail: true },
    })
    seedGroupAdmin(db, { tenantId: 'settings-admin-group', userId: subject })

    const res = await request(app)
      .get('/settings-admin-group/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(res.body.data.type, 'group-settings')
    assert.strictEqual(res.body.data.attributes.enableGroupEmail, true)

    const superadmin = await auth('superadmin-8', 'settings-superadmin@example.org', Scope.Superadmin)
    await request(app)
      .get('/settings-admin-group/settings')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)

    const outsider = await auth('outsider-8', 'settings-outsider@example.org')
    await request(app)
      .get('/settings-admin-group/settings')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    await request(app)
      .get('/settings-admin-group/settings')
      .expect(403)
  })

  test('PATCH /:code requires JWT', async () => {
    seedGroup(db, { tenantId: 'patch-auth', status: 'active', access: 'public' })

    await request(app)
      .patch('/patch-auth')
      .send({
        data: {
          type: 'groups',
          attributes: {
            name: 'Changed',
          }
        }
      })
      .expect(401)
  })

  test('PATCH /:code updates editable attributes for group admin', async () => {
    const { subject, token } = await auth('admin-9', 'patch-admin@example.org')
    seedGroup(db, { tenantId: 'patch-admin', status: 'active', access: 'public' })
    seedGroupAdmin(db, { tenantId: 'patch-admin', userId: subject })

    const res = await request(app)
      .patch('/patch-admin')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            name: 'Renamed Group',
            access: 'private',
            description: 'Updated description'
          }
        }
      })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.name, 'Renamed Group')
    assert.strictEqual(res.body.data.attributes.access, 'private')
    assert.strictEqual(res.body.data.attributes.description, 'Updated description')
  })

  test('PATCH /:code denies admin status transition from pending to active', async () => {
    const admin = await auth('admin-status-9', 'status-admin@example.org')
    seedGroup(db, { tenantId: 'status-transition', status: 'pending', access: 'public' })
    seedGroupAdmin(db, { tenantId: 'status-transition', userId: admin.subject })

    await request(app)
      .patch('/status-transition')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            status: 'active',
          }
        }
      })
      .expect(400)
  })

  test('PATCH /:code denies non-admin and allows superadmin for non-status updates', async () => {
    seedGroup(db, { tenantId: 'patch-permissions', status: 'active', access: 'public' })

    const regular = await auth('user-a', 'regular@example.org')
    await request(app)
      .patch('/patch-permissions')
      .set('Authorization', `Bearer ${regular.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            name: 'Regular cannot update',
          }
        }
      })
      .expect(403)

    const superadmin = await auth('superadmin-b', 'root@example.org', Scope.Superadmin)
    const elevated = await request(app)
      .patch('/patch-permissions')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            name: 'Superadmin updated',
          }
        }
      })
      .expect(200)

    assert.strictEqual(elevated.body.data.attributes.name, 'Superadmin updated')
  })

  test('PATCH /:code returns 404 for missing group', async () => {
    const { token } = await auth('user-c', 'missing@example.org')

    await request(app)
      .patch('/missing-group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            name: 'No-op',
          }
        }
      })
      .expect(404)
  })

  test('PATCH /:code validates request body', async () => {
    const { subject, token } = await auth('admin-d', 'schema@example.org')
    seedGroup(db, { tenantId: 'schema-group', status: 'active', access: 'public' })
    seedGroupAdmin(db, { tenantId: 'schema-group', userId: subject })

    await request(app)
      .patch('/schema-group')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            contacts: [{ type: 'fax', value: '123' }],
          }
        }
      })
      .expect(400)
  })
})
