import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { Scope } from '../src/server/auth'
import { auth } from './mocks/auth'
import { mockDb, resetDb } from './mocks/prisma'
import { MockDatabase, seedCategory, seedGroup, seedGroupAdmin, seedMember } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'

let app: any
let db: MockDatabase


before(async () => {
  const server = await setupTestServer()
  app = server.app
  db = mockDb()
})

after(async () => {
  await teardownTestServer()
})

describe('Categories endpoints', () => {
  beforeEach(() => {
    resetDb()
  })

  test('GET /:code/categories allows anonymous for active public group and only returns public categories', async () => {
    seedGroup(db, { tenantId: 'cats-public', status: 'active', access: 'public' })
    seedCategory(db, { tenantId: 'cats-public', code: 'pub', access: 'public' })
    seedCategory(db, { tenantId: 'cats-public', code: 'grp', access: 'group' })
    seedCategory(db, { tenantId: 'cats-public', code: 'prv', access: 'private' })

    const res = await request(app)
      .get('/cats-public/categories')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'pub')
  })

  test('GET /:code/categories returns public and group categories for group members', async () => {
    seedGroup(db, { tenantId: 'cats-member', status: 'active', access: 'public' })
    seedCategory(db, { tenantId: 'cats-member', code: 'pub', access: 'public' })
    seedCategory(db, { tenantId: 'cats-member', code: 'grp', access: 'group' })
    seedCategory(db, { tenantId: 'cats-member', code: 'prv', access: 'private' })

    const member = await auth('member-1')
    seedMember(db, { tenantId: 'cats-member', userId: member.subject })

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
    seedGroup(db, { tenantId: 'cats-admin', status: 'active', access: 'public' })
    seedCategory(db, { tenantId: 'cats-admin', code: 'pub', access: 'public' })
    seedCategory(db, { tenantId: 'cats-admin', code: 'grp', access: 'group' })
    seedCategory(db, { tenantId: 'cats-admin', code: 'prv', access: 'private' })

    const admin = await auth('admin-1')
    seedGroupAdmin(db, { tenantId: 'cats-admin', userId: admin.subject })

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

  test('GET /:code/categories enforces group-level access for non-public groups', async () => {
    seedGroup(db, { tenantId: 'cats-group-access', status: 'active', access: 'group' })
    seedCategory(db, { tenantId: 'cats-group-access', code: 'pub', access: 'public' })

    await request(app)
      .get('/cats-group-access/categories')
      .expect(403)

    const member = await auth('member-2')
    seedMember(db, { tenantId: 'cats-group-access', userId: member.subject })

    await request(app)
      .get('/cats-group-access/categories')
      .set('Authorization', `Bearer ${member.token}`)
      .expect(200)
  })

  test('GET /:code/categories denies non-admin for pending groups and allows admin and superadmin', async () => {
    seedGroup(db, { tenantId: 'cats-pending', status: 'pending', access: 'public' })
    seedCategory(db, { tenantId: 'cats-pending', code: 'pending-pub', access: 'public' })

    await request(app)
      .get('/cats-pending/categories')
      .expect(403)

    const outsider = await auth('outsider-pending')
    await request(app)
      .get('/cats-pending/categories')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)

    const admin = await auth('admin-pending')
    seedGroupAdmin(db, { tenantId: 'cats-pending', userId: admin.subject })

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

  test('GET /:code/categories returns 404 for missing group', async () => {
    await request(app)
      .get('/cats-missing/categories')
      .expect(404)
  })

  test('POST /:code/categories requires JWT', async () => {
    seedGroup(db, { tenantId: 'cats-post-auth', status: 'active', access: 'public' })

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
    seedGroup(db, { tenantId: 'cats-post-admin', status: 'active', access: 'public' })
    const admin = await auth('admin-post')
    seedGroupAdmin(db, { tenantId: 'cats-post-admin', userId: admin.subject })

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
    seedGroup(db, { tenantId: 'cats-post-perms', status: 'active', access: 'public' })

    const regular = await auth('regular-post')
    seedMember(db, { tenantId: 'cats-post-perms', userId: regular.subject })

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
    seedGroup(db, { tenantId: 'cats-post-schema', status: 'active', access: 'public' })
    const admin = await auth('admin-schema')
    seedGroupAdmin(db, { tenantId: 'cats-post-schema', userId: admin.subject })

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
    seedGroup(db, { tenantId: 'cats-patch-auth', status: 'active', access: 'public' })
    const category = seedCategory(db, { tenantId: 'cats-patch-auth', code: 'cat-one' })

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
    seedGroup(db, { tenantId: 'cats-patch-admin', status: 'active', access: 'public' })
    const admin = await auth('admin-patch')
    seedGroupAdmin(db, { tenantId: 'cats-patch-admin', userId: admin.subject })

    const category = seedCategory(db, {
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
    seedGroup(db, { tenantId: 'cats-patch-perms', status: 'active', access: 'public' })
    const category = seedCategory(db, { tenantId: 'cats-patch-perms', code: 'cat-patch' })
    const regular = await auth('regular-patch')
    seedMember(db, { tenantId: 'cats-patch-perms', userId: regular.subject })

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
    seedGroup(db, { tenantId: 'cats-patch-errors', status: 'active', access: 'public' })
    const admin = await auth('admin-patch-errors')
    seedGroupAdmin(db, { tenantId: 'cats-patch-errors', userId: admin.subject })

    await request(app)
      .patch('/cats-patch-errors/categories/missing')
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
      .patch('/cats-patch-errors/categories/missing')
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
    seedGroup(db, { tenantId: 'cats-delete-auth', status: 'active', access: 'public' })
    const category = seedCategory(db, { tenantId: 'cats-delete-auth', code: 'cat-delete-auth' })

    await request(app)
      .delete(`/cats-delete-auth/categories/${category.id}`)
      .expect(401)
  })

  test('DELETE /:code/categories/:category denies non-admin and allows admin', async () => {
    seedGroup(db, { tenantId: 'cats-delete-admin', status: 'active', access: 'public' })
    const admin = await auth('admin-delete')
    seedGroupAdmin(db, { tenantId: 'cats-delete-admin', userId: admin.subject })

    const first = seedCategory(db, { tenantId: 'cats-delete-admin', code: 'cat-delete-first' })
    const second = seedCategory(db, { tenantId: 'cats-delete-admin', code: 'cat-delete-second' })

    const regular = await auth('regular-delete')
    seedMember(db, { tenantId: 'cats-delete-admin', userId: regular.subject })

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
    seedGroup(db, { tenantId: 'cats-delete-errors', status: 'active', access: 'public' })
    const admin = await auth('admin-delete-errors')
    seedGroupAdmin(db, { tenantId: 'cats-delete-errors', userId: admin.subject })

    await request(app)
      .delete('/cats-delete-errors/categories/missing')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404)

    await request(app)
      .delete('/cats-delete-missing/categories/missing')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(404)
  })
})
