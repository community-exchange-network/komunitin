import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { Scope } from '../src/server/context'
import { auth } from './mocks/auth'
import { resetDb, seedCategory, seedGroup, seedGroupAdmin, seedMember } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { toUuid } from './mocks/utils'

let app: any

before(async () => {
  const server = await setupTestServer()
  app = server.app
})

after(async () => {
  await teardownTestServer()
})

describe('Categories endpoints', () => {
  beforeEach(async () => {
    await resetDb()
  })

  test('GET /:code/categories allows anonymous for active public group and only returns public categories', async () => {
    await seedGroup({ tenantId: 'cats-public', status: 'active', access: 'public' })
    await seedCategory({ tenantId: 'cats-public', code: 'pub', access: 'public' })
    await seedCategory({ tenantId: 'cats-public', code: 'grp', access: 'group' })
    await seedCategory({ tenantId: 'cats-public', code: 'prv', access: 'private' })

    const res = await request(app)
      .get('/cats-public/categories')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'pub')
  })

  test('GET /:code/categories returns public and group categories for group members', async () => {
    await seedGroup({ tenantId: 'cats-member', status: 'active', access: 'public' })
    await seedCategory({ tenantId: 'cats-member', code: 'pub', access: 'public' })
    await seedCategory({ tenantId: 'cats-member', code: 'grp', access: 'group' })
    await seedCategory({ tenantId: 'cats-member', code: 'prv', access: 'private' })

    const member = await auth('member-1')
    await seedMember({ tenantId: 'cats-member', userId: member.id })

    const res = await request(app)
      .get('/cats-member/categories')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200)

    const codes = res.body.data.map((resource: any) => resource.attributes.code)
    assert.strictEqual(codes.length, 2)
    assert.strictEqual(codes.includes('pub'), true)
    assert.strictEqual(codes.includes('grp'), true)
  })

  test('GET /:code/categories returns all categories for group admins and superadmins', async () => {
    await seedGroup({ tenantId: 'cats-admin', status: 'active', access: 'public' })
    await seedCategory({ tenantId: 'cats-admin', code: 'pub', access: 'public' })
    await seedCategory({ tenantId: 'cats-admin', code: 'grp', access: 'group' })
    await seedCategory({ tenantId: 'cats-admin', code: 'prv', access: 'private' })

    const admin = await auth('admin-1')
    await seedGroupAdmin({ tenantId: 'cats-admin', userId: admin.id })

    const adminRes = await request(app)
      .get('/cats-admin/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(adminRes.body.data.length, 3)

    const superadmin = await auth('superadmin-1', undefined, Scope.Superadmin)
    const superadminRes = await request(app)
      .get('/cats-admin/categories')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)

    assert.strictEqual(superadminRes.body.data.length, 3)
  })

  test('GET /:code/categories applies pagination, sorting and filtering generically', async () => {
    await seedGroup({ tenantId: 'cats-query', status: 'active', access: 'public' })
    await seedCategory({ tenantId: 'cats-query', code: 'a', name: 'Alpha', access: 'public' })
    await seedCategory({ tenantId: 'cats-query', code: 'b', name: 'Bravo', access: 'group' })
    await seedCategory({ tenantId: 'cats-query', code: 'c', name: 'Charlie', access: 'private' })

    const admin = await auth('admin-query')
    await seedGroupAdmin({ tenantId: 'cats-query', userId: admin.id })

    const firstPage = await request(app)
      .get('/cats-query/categories?sort=name&page[size]=1')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(firstPage.body.data.length, 1)
    assert.strictEqual(firstPage.body.data[0].attributes.name, 'Alpha')
    assert.strictEqual(typeof firstPage.body.links.self, 'string')
    assert.strictEqual(typeof firstPage.body.links.next, 'string')

    const secondPage = await request(app)
      .get('/cats-query/categories?sort=name&page[size]=1&page[after]=1')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(secondPage.body.data.length, 1)
    assert.strictEqual(secondPage.body.data[0].attributes.name, 'Bravo')

    const filtered = await request(app)
      .get('/cats-query/categories?filter[access]=private')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(filtered.body.data.length, 1)
    assert.strictEqual(filtered.body.data[0].attributes.code, 'c')
  })

  test('GET /:code/categories supports search across code, name and meta.description', async () => {
    await seedGroup({ tenantId: 'cats-search', status: 'active', access: 'public' })
    await seedCategory({
      tenantId: 'cats-search',
      code: 'food',
      name: 'Food Services',
      access: 'public',
      meta: {
        description: 'Fresh organic produce and meals',
      },
    })
    await seedCategory({
      tenantId: 'cats-search',
      code: 'transport',
      name: 'Transport',
      access: 'public',
      meta: {
        description: 'Ride sharing',
      },
    })

    const byCode = await request(app)
      .get('/cats-search/categories?filter[search]=food')
      .expect(200)

    assert.strictEqual(byCode.body.data.length, 1)
    assert.strictEqual(byCode.body.data[0].attributes.code, 'food')

    const byMetaDescription = await request(app)
      .get('/cats-search/categories?filter[search]=organic')
      .expect(200)

    assert.strictEqual(byMetaDescription.body.data.length, 1)
    assert.strictEqual(byMetaDescription.body.data[0].attributes.code, 'food')
  })

  test('GET /:code/categories paginates after visibility filtering', async () => {
    await seedGroup({ tenantId: 'cats-page', status: 'active', access: 'public' })
    await seedCategory({ tenantId: 'cats-page', code: 'hidden', name: 'Alpha', access: 'private' })
    await seedCategory({ tenantId: 'cats-page', code: 'visible', name: 'Bravo', access: 'public' })

    const res = await request(app)
      .get('/cats-page/categories?sort=name&page[size]=1')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'visible')
  })

  test('GET /:code/categories enforces group-level access for non-public groups', async () => {
    await seedGroup({ tenantId: 'cats-group-access', status: 'active', access: 'group' })
    await seedCategory({ tenantId: 'cats-group-access', code: 'pub', access: 'public' })

    await request(app)
      .get('/cats-group-access/categories')
      .expect(403)

    const member = await auth('member-2')
    await seedMember({ tenantId: 'cats-group-access', userId: member.id })

    await request(app)
      .get('/cats-group-access/categories')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200)
  })

  test('GET /:code/categories denies non-admin for pending groups and allows admin and superadmin', async () => {
    await seedGroup({ tenantId: 'cats-pending', status: 'pending', access: 'public' })
    await seedCategory({ tenantId: 'cats-pending', code: 'pending-pub', access: 'public' })

    await request(app)
      .get('/cats-pending/categories')
      .expect(403)

    const outsider = await auth('outsider-pending')
    await request(app)
      .get('/cats-pending/categories')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    const admin = await auth('admin-pending')
    await seedGroupAdmin({ tenantId: 'cats-pending', userId: admin.id })

    await request(app)
      .get('/cats-pending/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    const superadmin = await auth('superadmin-pending', undefined, Scope.Superadmin)
    await request(app)
      .get('/cats-pending/categories')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(200)
  })

  test('GET /:code/categories allows read-all scope for pending private group', async () => {
    await seedGroup({ tenantId: 'cats-read-all', status: 'pending', access: 'private' })
    await seedCategory({ tenantId: 'cats-read-all', code: 'hidden', access: 'private' })

    const serviceUser = await auth('cats-read-all-service', undefined, Scope.SocialReadAll)
    const res = await request(app)
      .get('/cats-read-all/categories')
      .set('Authorization', `Bearer ${serviceUser.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'hidden')
  })

  test('GET /:code/categories returns 404 for missing group', async () => {
    await request(app)
      .get('/cats-missing/categories')
      .expect(404)
  })

  test('POST /:code/categories requires JWT', async () => {
    await seedGroup({ tenantId: 'cats-post-auth', status: 'active', access: 'public' })

    await request(app)
      .post('/cats-post-auth/categories')
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'food',
            name: 'Food',
          },
        },
      })
      .expect(401)
  })

  test('POST /:code/categories allows group admin and persists attributes', async () => {
    await seedGroup({ tenantId: 'cats-post-admin', status: 'active', access: 'public' })
    const admin = await auth('admin-post')
    await seedGroupAdmin({ tenantId: 'cats-post-admin', userId: admin.id })

    const res = await request(app)
      .post('/cats-post-admin/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'food',
            name: 'Food',
            access: 'group',
            icon: {
              type: 'material',
              value: 'restaurant',
            },
          },
        },
      })
      .expect(201)

    assert.strictEqual(res.body.data.type, 'categories')
    assert.strictEqual(res.body.data.attributes.code, 'food')
    assert.strictEqual(res.body.data.attributes.name, 'Food')
    assert.strictEqual(res.body.data.attributes.access, 'group')
    assert.strictEqual(res.body.data.attributes.icon.type, 'material')
    assert.strictEqual(res.body.data.attributes.icon.value, 'restaurant')
  })

  test('POST /:code/categories allows superadmin and denies non-admin users', async () => {
    await seedGroup({ tenantId: 'cats-post-perms', status: 'active', access: 'public' })

    const regular = await auth('regular-post')
    await seedMember({ tenantId: 'cats-post-perms', userId: regular.id })

    await request(app)
      .post('/cats-post-perms/categories')
      .set('Authorization', `Bearer ${regular.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'regular',
            name: 'Regular Category',
          },
        },
      })
      .expect(403)

    const superadmin = await auth('super-post', undefined, Scope.Superadmin)
    await request(app)
      .post('/cats-post-perms/categories')
      .set('Authorization', `Bearer ${superadmin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'super',
            name: 'Super Category',
          },
        },
      })
      .expect(201)
  })

  test('POST /:code/categories validates body and rejects duplicate code', async () => {
    await seedGroup({ tenantId: 'cats-post-schema', status: 'active', access: 'public' })
    const admin = await auth('admin-schema')
    await seedGroupAdmin({ tenantId: 'cats-post-schema', userId: admin.id })

    await request(app)
      .post('/cats-post-schema/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'dup',
            name: 'Duplicate',
            access: 'unknown',
          },
        },
      })
      .expect(400)

    await request(app)
      .post('/cats-post-schema/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'dup',
            name: 'Duplicate',
          },
        },
      })
      .expect(201)

    await request(app)
      .post('/cats-post-schema/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'dup',
            name: 'Duplicate Again',
          },
        },
      })
      .expect(400)
  })

  test('POST /:code/categories returns 404 for missing group', async () => {
    const admin = await auth('admin-missing-group')

    await request(app)
      .post('/cats-missing-group/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            code: 'missing',
            name: 'Missing Group Category',
          },
        },
      })
      .expect(404)
  })

  test('PATCH /:code/categories/:category requires JWT', async () => {
    await seedGroup({ tenantId: 'cats-patch-auth', status: 'active', access: 'public' })
    const category = await seedCategory({ tenantId: 'cats-patch-auth', code: 'cat-one' })

    await request(app)
      .patch(`/cats-patch-auth/categories/${category.id}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            name: 'Renamed',
          },
        },
      })
      .expect(401)
  })

  test('PATCH /:code/categories/:category allows admin', async () => {
    await seedGroup({ tenantId: 'cats-patch-admin', status: 'active', access: 'public' })
    const admin = await auth('admin-patch')
    await seedGroupAdmin({ tenantId: 'cats-patch-admin', userId: admin.id })

    const category = await seedCategory({
      tenantId: 'cats-patch-admin',
      code: 'cat-by-id',
      name: 'Before Id',
      access: 'public',
    })

    const response = await request(app)
      .patch(`/cats-patch-admin/categories/${category.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            name: 'After Id',
            access: 'private',
          },
        },
      })
      .expect(200)

    assert.strictEqual(response.body.data.attributes.name, 'After Id')
    assert.strictEqual(response.body.data.attributes.access, 'private')

  })

  test('PATCH /:code/categories/:category denies non-admin and allows superadmin', async () => {
    await seedGroup({ tenantId: 'cats-patch-perms', status: 'active', access: 'public' })
    const category = await seedCategory({ tenantId: 'cats-patch-perms', code: 'cat-patch' })
    const regular = await auth('regular-patch')
    await seedMember({ tenantId: 'cats-patch-perms', userId: regular.id })

    await request(app)
      .patch(`/cats-patch-perms/categories/${category.id}`)
      .set('Authorization', `Bearer ${regular.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            name: 'Should Fail',
          },
        },
      })
      .expect(403)

    const superadmin = await auth('super-patch', undefined, Scope.Superadmin)
    await request(app)
      .patch(`/cats-patch-perms/categories/${category.id}`)
      .set('Authorization', `Bearer ${superadmin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            name: 'Super Updated',
          },
        },
      })
      .expect(200)
  })

  test('PATCH /:code/categories/:category validates body and returns 404 for missing category', async () => {
    await seedGroup({ tenantId: 'cats-patch-errors', status: 'active', access: 'public' })
    const admin = await auth('admin-patch-errors')
    await seedGroupAdmin({ tenantId: 'cats-patch-errors', userId: admin.id })
    const missingCategoryId = toUuid('cats-patch-errors-missing')

    await request(app)
      .patch(`/cats-patch-errors/categories/${missingCategoryId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            access: 'invalid',
          },
        },
      })
      .expect(400)

    await request(app)
      .patch(`/cats-patch-errors/categories/${missingCategoryId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'categories',
          attributes: {
            name: 'Missing',
          },
        },
      })
      .expect(404)
  })

  test('DELETE /:code/categories/:category requires JWT', async () => {
    await seedGroup({ tenantId: 'cats-delete-auth', status: 'active', access: 'public' })
    const category = await seedCategory({ tenantId: 'cats-delete-auth', code: 'cat-delete-auth' })

    await request(app)
      .delete(`/cats-delete-auth/categories/${category.id}`)
      .expect(401)
  })

  test('DELETE /:code/categories/:category denies non-admin and allows admin', async () => {
    await seedGroup({ tenantId: 'cats-delete-admin', status: 'active', access: 'public' })
    const admin = await auth('admin-delete')
    await seedGroupAdmin({ tenantId: 'cats-delete-admin', userId: admin.id })

    const first = await seedCategory({ tenantId: 'cats-delete-admin', code: 'cat-delete-first' })
    const second = await seedCategory({ tenantId: 'cats-delete-admin', code: 'cat-delete-second' })

    const regular = await auth('regular-delete')
    await seedMember({ tenantId: 'cats-delete-admin', userId: regular.id })

    const superadmin = await auth('superadmin-delete', undefined, Scope.Superadmin)

    await request(app)
      .delete(`/cats-delete-admin/categories/${first.id}`)
      .set('Authorization', `Bearer ${regular.token}`)
      .expect(403)

    await request(app)
      .delete(`/cats-delete-admin/categories/${first.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(204)

    await request(app)
      .delete(`/cats-delete-admin/categories/${second.id}`)
      .set('Authorization', `Bearer ${superadmin.token}`)
      .expect(204)

    const listAfterDelete = await request(app)
      .get('/cats-delete-admin/categories')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    const codes = listAfterDelete.body.data.map((resource: any) => resource.attributes.code)
    assert.strictEqual(codes.includes(first.code), false)
    assert.strictEqual(codes.includes(second.code), false)
  })

  test('DELETE /:code/categories/:category returns 404 for missing category or group', async () => {
    await seedGroup({ tenantId: 'cats-delete-errors', status: 'active', access: 'public' })
    const admin = await auth('admin-delete-errors')
    await seedGroupAdmin({ tenantId: 'cats-delete-errors', userId: admin.id })
    const missingCategoryId = toUuid('cats-delete-errors-missing')

    await request(app)
      .delete(`/cats-delete-errors/categories/${missingCategoryId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404)

    await request(app)
      .delete(`/cats-delete-missing/categories/${missingCategoryId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404)
  })
})
