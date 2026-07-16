import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { tenantDb } from '../src/server/multitenant'
import prisma from '../src/utils/prisma'
import { Scope } from '../src/server/context'
import { auth, serviceAuth } from './mocks/auth'
import {
  getAccountingRequests,
  getAccountingRequestPaths,
  getAuthTokenRequests,
  getNotificationsEvents,
  resetMockState,
  seedAccountingCurrency,
  setAccountingCurrencyDeleteStatus,
} from './mocks/handlers'
import { resetDb, seedCategory, seedGroup, seedGroupAdmin, seedMember } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { toUuid } from './mocks/utils'

let app: any
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=',
  'base64',
)

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
    resetMockState()
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

    const events = getNotificationsEvents() as any[]
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].data.attributes.name, 'GroupRequested')
    assert.strictEqual(events[0].data.attributes.code, 'alpha-group')
    assert.strictEqual(events[0].data.attributes.data.group, 'alpha-group')
  })

  test('POST /groups accepts currency inclusion with JSON:API linkage', async () => {
    const { token } = await auth('currency-request-user')
    const currencyId = toUuid('currency-request')

    const res = await request(app)
      .post('/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            code: 'currency-request-group',
            name: 'Currency request group',
          },
          relationships: {
            currency: {
              data: { type: 'currencies', id: currencyId },
            },
          },
        },
        included: [{
          type: 'currencies',
          id: currencyId,
          attributes: { code: 'CRG' },
        }],
      })
      .expect(201)

    assert.strictEqual(res.body.data.attributes.code, 'currency-request-group')
  })

  test('POST /groups rejects duplicate code', async () => {
    const { token } = await auth('user-2')
    await postGroup(token, 'dupe-code').expect(201)
    await postGroup(token, 'dupe-code').expect(400)
  })

  test('GET /groups defaults to active status while preserving access rules', async () => {
    await seedGroup({ tenantId: 'public-active', status: 'active', access: 'public' })
    await seedGroup({ tenantId: 'public-pending', status: 'pending', access: 'public' })
    await seedGroup({ tenantId: 'group-active', status: 'active', access: 'group' })
    await seedGroup({ tenantId: 'private-active', status: 'active', access: 'private' })
    await seedGroup({ tenantId: 'admin-owned', status: 'pending', access: 'private' })

    const anonymous = await request(app)
      .get('/groups?filter[status]=pending,active')
      .expect(200)

    assert.strictEqual(Array.isArray(anonymous.body.data), true)
    assert.strictEqual(anonymous.body.data.length, 1)
    assert.strictEqual(anonymous.body.data[0].attributes.code, 'public-active')

    const { token } = await auth('user-3')
    const authenticated = await request(app)
      .get('/groups?filter[status]=pending,active')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    assert.strictEqual(authenticated.body.data.length, 1)
    assert.strictEqual(authenticated.body.data[0].attributes.code, 'public-active')

    const admin = await auth('admin-3')
    await seedGroupAdmin({ tenantId: 'admin-owned', userId: admin.id })

    const adminResult = await request(app)
      .get('/groups?filter[status]=pending,active')
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
    assert.strictEqual(superadminCodes.length, 3)
    assert.strictEqual(superadminCodes.includes('public-active'), true)
    assert.strictEqual(superadminCodes.includes('public-pending'), false)
    assert.strictEqual(superadminCodes.includes('group-active'), true)
    assert.strictEqual(superadminCodes.includes('private-active'), true)
    assert.strictEqual(superadminCodes.includes('admin-owned'), false)

    const superadminPendingResult = await request(app)
      .get('/groups?filter[status]=active,pending')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)

    const superadminPendingCodes = superadminPendingResult.body.data.map((resource: any) => resource.attributes.code)
    assert.strictEqual(superadminPendingCodes.length, 5)
    assert.strictEqual(superadminPendingCodes.includes('public-pending'), true)
    assert.strictEqual(superadminPendingCodes.includes('admin-owned'), true)
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

  test('GET /groups sorts by distance when location provided', async () => {
    await seedGroup({ tenantId: 'loc-alpha', name: 'Alpha Location', status: 'active', access: 'public', latitude: 40.7128, longitude: -74.0060 })
    await seedGroup({ tenantId: 'loc-bravo', name: 'Bravo Location', status: 'active', access: 'public', latitude: 34.0522, longitude: -118.2437 })
    await seedGroup({ tenantId: 'loc-charlie', name: 'Charlie Location', status: 'active', access: 'public' })
    
    const res = await request(app)
      .get('/groups?near=-87.6298,41.8781&sort=distance')
      .expect(200)
    assert.strictEqual(res.body.data.length, 3)
    assert.deepStrictEqual(
      res.body.data.map((group: any) => group.attributes.code),
      ['loc-alpha', 'loc-bravo', 'loc-charlie']
    )

    const res2 = await request(app)
      .get('/groups?near=-118.2437,34.0522&sort=distance')
      .expect(200)
    assert.strictEqual(res2.body.data.length, 3)
    assert.deepStrictEqual(
      res2.body.data.map((group: any) => group.attributes.code),
      ['loc-bravo', 'loc-alpha', 'loc-charlie']
    )
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

  test('GET /groups?include=currency includes external currency references', async () => {
    const currencyId = toUuid('currency-include-group')
    await seedGroup({
      tenantId: 'currency-include-group',
      status: 'active',
      access: 'public',
      currencyId,
    })

    const res = await request(app)
      .get('/groups?include=currency')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].relationships.currency.data.type, 'currencies')
    assert.strictEqual(res.body.data[0].relationships.currency.data.id, currencyId)
    assert.strictEqual(res.body.data[0].relationships.currency.data.meta.external, true)
    assert.strictEqual(res.body.data[0].relationships.currency.data.meta.href, 'http://localhost:2025/currency-include-group/currency')

    assert.ok(Array.isArray(res.body.included))
    assert.strictEqual(res.body.included.length, 1)
    assert.deepStrictEqual(res.body.included[0], {
      type: 'currencies',
      id: currencyId,
      meta: {
        external: true,
        href: 'http://localhost:2025/currency-include-group/currency',
      },
    })
    assert.deepStrictEqual(getAccountingRequestPaths(), [])
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

  test('GET /:code includes group admins relationship linkage', async () => {
    await seedGroup({ tenantId: 'group-admins-include', status: 'active', access: 'public' })
    const admin = await auth('group-admins-user')
    await seedGroupAdmin({ tenantId: 'group-admins-include', userId: admin.id })

    const res = await request(app)
      .get('/group-admins-include')
      .expect(200)

    assert.strictEqual(res.body.data.relationships.admins.data.some((resource: any) => resource.id === admin.id), true)
    // Not including admins as included resources.
    assert.strictEqual(Array.isArray(res.body.included) && res.body.included.some((resource: any) => resource.type === 'users' && resource.id === admin.id), false)
  })

  test('GET /:code allows service read access for pending private group', async () => {
    await seedGroup({ tenantId: 'group-read-all', status: 'pending', access: 'private' })

    const regularUser = await auth('group-read-all-regular')
    await request(app)
      .get('/group-read-all')
      .set('Authorization', `Bearer ${regularUser.token}`)
      .expect(403)

    const serviceUser = await serviceAuth()
    const res = await request(app)
      .get('/group-read-all')
      .set('Authorization', `Bearer ${serviceUser.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.attributes.code, 'group-read-all')
    assert.strictEqual(res.body.data.attributes.status, 'pending')
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

  test('GET /:code?include=currency includes external currency reference', async () => {
    const currencyId = toUuid('single-currency-include-group')
    await seedGroup({
      tenantId: 'single-currency-include-group',
      status: 'active',
      access: 'public',
      currencyId,
    })

    const res = await request(app)
      .get('/single-currency-include-group?include=currency')
      .expect(200)

    assert.strictEqual(res.body.data.relationships.currency.data.type, 'currencies')
    assert.strictEqual(res.body.data.relationships.currency.data.id, currencyId)
    assert.strictEqual(res.body.data.relationships.currency.data.meta.external, true)
    assert.strictEqual(res.body.data.relationships.currency.data.meta.href, 'http://localhost:2025/single-currency-include-group/currency')

    assert.ok(Array.isArray(res.body.included))
    assert.deepStrictEqual(res.body.included[0], {
      type: 'currencies',
      id: currencyId,
      meta: {
        external: true,
        href: 'http://localhost:2025/single-currency-include-group/currency',
      },
    })
    assert.deepStrictEqual(getAccountingRequestPaths(), [])
  })

  test('DELETE /:code requires JWT', async () => {
    await seedGroup({ tenantId: 'delete-auth', status: 'active', access: 'public' })

    await request(app)
      .delete('/delete-auth')
      .expect(401)

    assert.deepStrictEqual(getAccountingRequestPaths(), [])
  })

  test('DELETE /:code soft-deletes group as admin after accounting currency delete', async () => {
    const admin = await auth('delete-group-admin')
    const staleCurrencyId = toUuid('delete-group-stale-currency-id')
    seedAccountingCurrency('delete-group-success', toUuid('delete-group-accounting-currency-id'))
    await seedGroup({
      tenantId: 'delete-group-success',
      status: 'active',
      access: 'public',
      currencyId: staleCurrencyId,
    })
    await seedGroupAdmin({ tenantId: 'delete-group-success', userId: admin.id })
    const member = await seedMember({ tenantId: 'delete-group-success' })

    await request(app)
      .delete('/delete-group-success')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      'DELETE /delete-group-success/currency',
    ])
    assert.deepStrictEqual(getAuthTokenRequests(), [{
      clientId: 'komunitin-social',
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      scope: Scope.AccountingWrite,
      subjectToken: admin.token,
    }])
    assert.strictEqual(
      getAccountingRequests()[0].authorization,
      'Bearer exchanged-accounting-write',
    )

    const db = tenantDb(prisma, 'delete-group-success')
    const group = await db.group.findFirstOrThrow()
    assert.ok(group.deleted)
    assert.strictEqual(group.currencyId, staleCurrencyId)

    const storedMember = await db.member.findFirstOrThrow({ where: { id: member.id } })
    assert.strictEqual(storedMember.deleted, null)
  })

  test('DELETE /:code allows superadmin', async () => {
    const superadmin = await auth('delete-group-superadmin', undefined, Scope.Superadmin)
    const currency = seedAccountingCurrency('delete-group-superadmin')
    await seedGroup({
      tenantId: 'delete-group-superadmin',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })

    await request(app)
      .delete('/delete-group-superadmin')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      'DELETE /delete-group-superadmin/currency',
    ])
  })

  test('DELETE /:code denies outsiders before accounting call', async () => {
    const currency = seedAccountingCurrency('delete-group-denied')
    await seedGroup({
      tenantId: 'delete-group-denied',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    const outsider = await auth('delete-group-outsider')

    await request(app)
      .delete('/delete-group-denied')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    assert.deepStrictEqual(getAccountingRequestPaths(), [])
    const db = tenantDb(prisma, 'delete-group-denied')
    const group = await db.group.findFirstOrThrow()
    assert.strictEqual(group.deleted, null)
  })

  test('DELETE /:code treats missing accounting currency as already deleted', async () => {
    const admin = await auth('delete-group-missing-currency-admin')
    await seedGroup({
      tenantId: 'delete-group-missing-currency',
      status: 'active',
      access: 'public',
    })
    await seedGroupAdmin({ tenantId: 'delete-group-missing-currency', userId: admin.id })

    await request(app)
      .delete('/delete-group-missing-currency')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      'DELETE /delete-group-missing-currency/currency',
    ])
    const db = tenantDb(prisma, 'delete-group-missing-currency')
    const group = await db.group.findFirstOrThrow()
    assert.ok(group.deleted)
  })

  test('DELETE /:code leaves group untouched when accounting deletion fails', async () => {
    const admin = await auth('delete-group-accounting-failure-admin')
    const currency = seedAccountingCurrency('delete-group-accounting-failure')
    await seedGroup({
      tenantId: 'delete-group-accounting-failure',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    await seedGroupAdmin({ tenantId: 'delete-group-accounting-failure', userId: admin.id })
    setAccountingCurrencyDeleteStatus(500, 'Currency has remaining accounts')

    await request(app)
      .delete('/delete-group-accounting-failure')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(500)

    assert.deepStrictEqual(getAccountingRequestPaths(), [
      'DELETE /delete-group-accounting-failure/currency',
    ])
    const db = tenantDb(prisma, 'delete-group-accounting-failure')
    const group = await db.group.findFirstOrThrow()
    assert.strictEqual(group.deleted, null)
  })

  test('deleted groups are hidden from group and tenant endpoints', async () => {
    await seedGroup({
      tenantId: 'deleted-group-hidden',
      status: 'active',
      access: 'public',
      deleted: new Date(), // deleted
    })
    await seedCategory({ tenantId: 'deleted-group-hidden' })

    const groups = await request(app)
      .get('/groups?filter[status]=active')
      .expect(200)

    assert.deepStrictEqual(groups.body.data, [])

    await request(app)
      .get('/deleted-group-hidden')
      .expect(404)

    await request(app)
      .get('/deleted-group-hidden/settings')
      .expect(404)

    await request(app)
      .get('/deleted-group-hidden/categories')
      .expect(404)
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
      .expect(403)
  })

  test('PATCH /:code activates pending group via accounting create and exposes external currency relationship', async () => {
    const superadmin = await auth('group-activate-superadmin', undefined, Scope.Superadmin)

    await seedGroup({
      tenantId: 'activate-group',
      status: 'pending',
      access: 'public',
      meta: {
        request: {
          currency: {
            name: 'Activate Currency',
          },
        },
      },
    })

    const res = await request(app)
      .patch('/activate-group')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            status: 'active',
          }
        }
      })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.status, 'active')
    assert.strictEqual(res.body.data.relationships.currency.data.type, 'currencies')
    assert.strictEqual(res.body.data.relationships.currency.data.meta.external, true)
    assert.strictEqual(res.body.data.relationships.currency.data.meta.href, 'http://localhost:2025/activate-group/currency')

    assert.deepStrictEqual(
      getAccountingRequestPaths(),
      ['GET /activate-group/currency', 'POST /currencies'],
    )

    const db = tenantDb(prisma, 'activate-group')
    const group = await db.group.findFirstOrThrow()
    assert.strictEqual(group.status, 'active')
    assert.strictEqual(group.currencyId, res.body.data.relationships.currency.data.id)
    assert.deepStrictEqual(group.meta, {
      request: {
        currency: {
          name: 'Activate Currency',
        },
      },
    })

    const events = getNotificationsEvents() as any[]
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].data.attributes.name, 'GroupActivated')
    assert.strictEqual(events[0].data.attributes.code, 'activate-group')
  })

  test('PATCH /:code adopts existing accounting currency without creating a new one', async () => {
    const superadmin = await auth('group-adopt-superadmin', undefined, Scope.Superadmin)
    const currency = seedAccountingCurrency('adopt-group')

    await seedGroup({
      tenantId: 'adopt-group',
      status: 'pending',
      access: 'public',
      meta: {
        request: {
          currency: {
            name: 'Adopt Group Currency',
          },
        },
      },
    })

    const res = await request(app)
      .patch('/adopt-group')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            status: 'active',
          }
        }
      })
      .expect(200)

    assert.strictEqual(res.body.data.relationships.currency.data.id, currency.id)
    assert.deepStrictEqual(
      getAccountingRequestPaths(),
      ['GET /adopt-group/currency'],
    )
    assert.deepStrictEqual(getAuthTokenRequests(), [{
      clientId: 'komunitin-social',
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      scope: Scope.AccountingRead,
      subjectToken: superadmin.token,
    }])
    assert.strictEqual(
      getAccountingRequests()[0].authorization,
      'Bearer exchanged-accounting-read',
    )
  })

  test('PATCH /:code allows group admin to disable and reactivate with accounting sync', async () => {
    const currency = seedAccountingCurrency('group-toggle')
    const admin = await auth('group-toggle-admin')
    await seedGroup({
      tenantId: 'group-toggle',
      status: 'active',
      access: 'public',
      currencyId: currency.id,
    })
    await seedGroupAdmin({ tenantId: 'group-toggle', userId: admin.id })

    const disabled = await request(app)
      .patch('/group-toggle')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            status: 'disabled',
          }
        }
      })
      .expect(200)

    assert.strictEqual(disabled.body.data.attributes.status, 'disabled')

    const reactivated = await request(app)
      .patch('/group-toggle')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            status: 'active',
          }
        }
      })
      .expect(200)

    assert.strictEqual(reactivated.body.data.attributes.status, 'active')
    assert.deepStrictEqual(
      getAccountingRequestPaths(),
      [
        'GET /group-toggle/currency',
        'PATCH /group-toggle/currency',
        'GET /group-toggle/currency',
        'PATCH /group-toggle/currency',
      ],
    )
    assert.strictEqual(getNotificationsEvents().length, 0)
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

  test('PATCH and DELETE /:code sync group image files by URL', async () => {
    const admin = await auth('group-files-admin')
    const group = await seedGroup({ tenantId: 'group-files', status: 'active', access: 'public' })
    await seedGroupAdmin({ tenantId: 'group-files', userId: admin.id })

    const firstUpload = await request(app)
      .post('/group-files/files/upload')
      .set('Authorization', `Bearer ${admin.token}`)
      .field('resourceType', 'groups')
      .attach('file', tinyPng, { filename: 'group-one.png', contentType: 'image/png' })
      .expect(201)

    const secondUpload = await request(app)
      .post('/group-files/files/upload')
      .set('Authorization', `Bearer ${admin.token}`)
      .field('resourceType', 'groups')
      .attach('file', tinyPng, { filename: 'group-two.png', contentType: 'image/png' })
      .expect(201)

    const firstUrl = firstUpload.body.data.attributes.url
    const secondUrl = secondUpload.body.data.attributes.url
    const db = tenantDb(prisma, 'group-files')

    await request(app)
      .patch('/group-files')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            image: { url: firstUrl, alt: 'Primary image' },
          },
        },
      })
      .expect(200)

    let files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    let fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(firstUrl)?.resourceId, group.id)
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)

    const replaced = await request(app)
      .patch('/group-files')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            image: { url: secondUrl, alt: 'Replacement image' },
          },
        },
      })
      .expect(200)

    assert.strictEqual(replaced.body.data.attributes.image.url, secondUrl)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(firstUrl)?.resourceId, null)
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, group.id)

    const cleared = await request(app)
      .patch('/group-files')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            image: null,
          },
        },
      })
      .expect(200)

    assert.strictEqual(cleared.body.data.attributes.image, null)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)

    await request(app)
      .patch('/group-files')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'groups',
          attributes: {
            image: { url: secondUrl, alt: 'Image to unlink on delete' },
          },
        },
      })
      .expect(200)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, group.id)

    await request(app)
      .delete('/group-files')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)
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
