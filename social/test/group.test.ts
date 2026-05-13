import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { Scope } from '../src/server/auth'
import { auth } from './mocks/auth'
import { resetDb, seedGroup, seedGroupAdmin, seedMember, seedUser } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'

let app: any
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
})

after(async () => {
  await teardownTestServer()
})

describe('Groups endpoints', () => {
  beforeEach(async () => {
    await resetDb()
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
    const { id: subject, token } = await auth('user-1')

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

    const { token: superadminToken } = await auth('superadmin-1', undefined, Scope.Superadmin)
    await request(app)
      .get('/alpha-group')
      .set('Authorization', `Bearer ${superadminToken}`)
      .expect(200)

    const { token: outsiderToken } = await auth('outsider-1')
    await request(app)
      .get('/alpha-group')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403)
  })

  test('POST /groups rejects duplicate code', async () => {
    const { token } = await auth('user-2')
    await postGroup(token, 'dupe-code').expect(201)
    await postGroup(token, 'dupe-code').expect(400)
  })

  test('GET /groups returns only active public groups', async () => {
    await seedGroup({ tenantId: 'public-active', status: 'active', access: 'public' })
    await seedGroup({ tenantId: 'public-pending', status: 'pending', access: 'public' })
    await seedGroup({ tenantId: 'group-active', status: 'active', access: 'group' })
    await seedGroup({ tenantId: 'private-active', status: 'active', access: 'private' })
    await seedGroup({ tenantId: 'admin-owned', status: 'pending', access: 'private' })

    const anonymous = await request(app)
      .get('/groups')
      .expect(200)

    assert.strictEqual(Array.isArray(anonymous.body.data), true)
    assert.strictEqual(anonymous.body.data.length, 1)
    assert.strictEqual(anonymous.body.data[0].attributes.code, 'public-active')

    const { token } = await auth('user-3')
    const authenticated = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(authenticated.body.data.length, 1)
    assert.strictEqual(authenticated.body.data[0].attributes.code, 'public-active')

    const admin = await auth('admin-3')
    await seedGroupAdmin({ tenantId: 'admin-owned', userId: admin.id })

    const adminResult = await request(app)
      .get('/groups')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    const adminCodes = adminResult.body.data.map((resource: any) => resource.attributes.code)
    assert.strictEqual(adminCodes.includes('public-active'), true)
    assert.strictEqual(adminCodes.includes('admin-owned'), true)

    const superadmin = await auth('superadmin-3', undefined, Scope.Superadmin)
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

  test('GET /groups applies pagination, sorting and filtering generically', async () => {
    await seedGroup({ tenantId: 'aa-group', name: 'Alpha Group', status: 'active', access: 'public' })
    await seedGroup({ tenantId: 'bb-group', name: 'Bravo Group', status: 'active', access: 'public' })
    await seedGroup({ tenantId: 'cc-group', name: 'Charlie Group', status: 'pending', access: 'public' })

    const firstPage = await request(app)
      .get('/groups?sort=name&page[size]=1')
      .expect(200)

    assert.strictEqual(firstPage.body.data.length, 1)
    assert.strictEqual(firstPage.body.data[0].attributes.name, 'Alpha Group')
    assert.strictEqual(typeof firstPage.body.links.self, 'string')
    assert.strictEqual(typeof firstPage.body.links.next, 'string')

    const secondPage = await request(app)
      .get('/groups?sort=name&page[size]=1&page[after]=1')
      .expect(200)

    assert.strictEqual(secondPage.body.data.length, 1)
    assert.strictEqual(secondPage.body.data[0].attributes.name, 'Bravo Group')

    const superadmin = await auth('superadmin-query', undefined, Scope.Superadmin)
    const filtered = await request(app)
      .get('/groups?filter[status]=pending')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)

    assert.strictEqual(filtered.body.data.length, 1)
    assert.strictEqual(filtered.body.data[0].attributes.code, 'cc-group')
  })

  test('GET /groups filters by code', async () => {
    await seedGroup({ tenantId: 'code-one', name: 'Code One', status: 'active', access: 'public' })
    await seedGroup({ tenantId: 'code-two', name: 'Code Two', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/groups?filter[code]=code-one')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'code-one')

    const multiRes = await request(app)
      .get('/groups?filter[code]=code-one,code-two')
      .expect(200)

    assert.strictEqual(multiRes.body.data.length, 2)
    const codes = multiRes.body.data.map((group: any) => group.attributes.code)
    assert.strictEqual(codes.includes('code-one'), true)
    assert.strictEqual(codes.includes('code-two'), true)
  })

  test('GET /groups search by name', async () => {
    await seedGroup({ tenantId: 'search-alpha', name: 'Alpha Search', status: 'active', access: 'public' })
    await seedGroup({ tenantId: 'search-bravo', name: 'Bravo Search', status: 'active', access: 'public' })
    
    const res = await request(app)
      .get('/groups?filter[search]=alpha')
      .expect(200)
    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'search-alpha')
  })

  test('GET /groups search includes JSON values but not JSON keys', async () => {
    await seedGroup({
      tenantId: 'search-json',
      name: 'JSON Search',
      status: 'active',
      access: 'public',
      address: {
        addressLocality: 'Riverdale',
        streetAddress: '42 Main Street',
      },
      contacts: [
        { type: 'email', value: 'hello@example.org' },
      ],
    })

    const valueRes = await request(app)
      .get('/groups?filter[search]=riverdale')
      .expect(200)
    assert.strictEqual(valueRes.body.data.length, 1)
    assert.strictEqual(valueRes.body.data[0].attributes.code, 'search-json')

    const keyRes = await request(app)
      .get('/groups?filter[search]=addressLocality')
      .expect(200)
    assert.strictEqual(keyRes.body.data.length, 0)
  })

  test.todo('GET /groups sorts by distance when location provided', async () => {
    await seedGroup({ tenantId: 'loc-alpha', name: 'Alpha Location', status: 'active', access: 'public', latitude: 40.7128, longitude: -74.0060 })
    await seedGroup({ tenantId: 'loc-bravo', name: 'Bravo Location', status: 'active', access: 'public', latitude: 34.0522, longitude: -118.2437 })
    
    const res = await request(app)
      .get('/groups?near=41.8781,-87.6298&sort=distance')
      .expect(200)
    assert.strictEqual(res.body.data.length, 2)
    assert.strictEqual(res.body.data[0].attributes.code, 'loc-alpha')
    assert.strictEqual(res.body.data[1].attributes.code, 'loc-bravo')

    const res2 = await request(app)
      .get('/groups?near=34.0522,-118.2437&sort=distance')
      .expect(200)
    assert.strictEqual(res2.body.data.length, 2)
    assert.strictEqual(res2.body.data[0].attributes.code, 'loc-bravo')
    assert.strictEqual(res2.body.data[1].attributes.code, 'loc-alpha')
  })

  test('GET /groups paginates after visibility filtering', async () => {
    await seedGroup({ tenantId: 'hidden-group', name: 'Alpha Hidden', status: 'active', access: 'private' })
    await seedGroup({ tenantId: 'visible-group', name: 'Bravo Visible', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/groups?sort=name&page[size]=1')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'visible-group')
  })

  test('GET /groups?include=settings includes settings relationship data', async () => {
    await seedGroup({
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
    await seedGroup({ tenantId: 'public-one', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/public-one')
      .expect(200)

    assert.strictEqual(res.body.data.type, 'groups')
    assert.strictEqual(res.body.data.attributes.code, 'public-one')
  })

  test('GET /:code allows group member and denies non-member for group access', async () => {
    await seedGroup({ tenantId: 'member-group', status: 'active', access: 'group' })

    const member = await auth('user-5')
    await seedMember({ tenantId: 'member-group', userId: member.id })

    const memberResult = await request(app)
      .get('/member-group')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200)

    assert.strictEqual(memberResult.body.data.attributes.code, 'member-group')

    const outsider = await auth('user-6')
    await request(app)
      .get('/member-group')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    const admin = await auth('admin-6')
    await seedGroupAdmin({ tenantId: 'member-group', userId: admin.id })
    await request(app)
      .get('/member-group')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    const superadmin = await auth('superadmin-6', undefined, Scope.Superadmin)
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
    await seedGroup({ tenantId: 'settings-auth', status: 'active', access: 'public' })

    await request(app)
      .get('/settings-auth/settings')
      .expect(200)
  })

  test('GET /:code/settings allows admin and superadmin, denies others for pending public group', async () => {
    const { id: subject, token } = await auth('admin-8')
    await seedGroup({
      tenantId: 'settings-admin-group',
      status: 'pending',
      access: 'public',
      settings: { enableGroupEmail: true },
    })
    await seedGroupAdmin({ tenantId: 'settings-admin-group', userId: subject })

    const res = await request(app)
      .get('/settings-admin-group/settings')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(res.body.data.type, 'group-settings')
    assert.strictEqual(res.body.data.attributes.enableGroupEmail, true)

    const superadmin = await auth('superadmin-8', undefined, Scope.Superadmin)
    await request(app)
      .get('/settings-admin-group/settings')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)

    const outsider = await auth('outsider-8')
    await request(app)
      .get('/settings-admin-group/settings')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    await request(app)
      .get('/settings-admin-group/settings')
      .expect(403)
  })

  test('GET /:code?include=settings includes settings', async () => {
    await seedGroup({
      tenantId: 'settings-include-group',
      status: 'active',
      access: 'public',
      settings: { defaultGroupEmailFrequency: 'weekly' },
    })

    const res = await request(app)
      .get('/settings-include-group?include=settings')
      .expect(200)

    assert.ok(Array.isArray(res.body.included))
    assert.strictEqual(res.body.included[0].type, 'group-settings')
    assert.strictEqual(res.body.included[0].attributes.defaultGroupEmailFrequency, 'weekly')
  })


  test('PATCH /:code requires JWT', async () => {
    await seedGroup({ tenantId: 'patch-auth', status: 'active', access: 'public' })

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
    const { id: subject, token } = await auth('admin-9')
    await seedGroup({ tenantId: 'patch-admin', status: 'active', access: 'public' })
    await seedGroupAdmin({ tenantId: 'patch-admin', userId: subject })

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
    const admin = await auth('admin-status-9')
    await seedGroup({ tenantId: 'status-transition', status: 'pending', access: 'public' })
    await seedGroupAdmin({ tenantId: 'status-transition', userId: admin.id })

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
    await seedGroup({ tenantId: 'patch-permissions', status: 'active', access: 'public' })

    const regular = await auth('user-a')
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

    const superadmin = await auth('superadmin-b', undefined, Scope.Superadmin)
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
    const { token } = await auth('user-c')

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
    const { id: subject, token } = await auth('admin-d')
    await seedGroup({ tenantId: 'schema-group', status: 'active', access: 'public' })
    await seedGroupAdmin({ tenantId: 'schema-group', userId: subject })

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

  test('PATCH /:code/settings is forbidden for non-admin group members', async () => {
    await seedGroup({ tenantId: 'settings-forbidden-group', status: 'active', access: 'public' })
    const member = await auth('user-e')
    await seedMember({ tenantId: 'settings-forbidden-group', userId: member.id })

    await request(app)
      .patch('/settings-forbidden-group/settings')
      .set('Authorization', `Bearer ${member.token}`)
      .send({
        data: {
          type: 'group-settings',
          attributes: {
            defaultGroupEmailFrequency: 'weekly',
          }
        }
      })
      .expect(403)
  })

  test('PATCH /:code/settings allows updating settings', async () => {
    const { id: subject, token } = await auth('admin-e')
    await seedGroup({
      tenantId: 'settings-patch-group',
      status: 'active',
      access: 'public',
      settings: { defaultGroupEmailFrequency: 'weekly' },
    })
    await seedGroupAdmin({ tenantId: 'settings-patch-group', userId: subject })

    const res = await request(app)
      .patch('/settings-patch-group/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'group-settings',
          attributes: {
            defaultGroupEmailFrequency: 'monthly',
          }
        }
      })
      .expect(200)

    assert.strictEqual(res.body.data.type, 'group-settings')
    assert.strictEqual(res.body.data.attributes.defaultGroupEmailFrequency, 'monthly')
  })
})
