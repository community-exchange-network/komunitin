import assert from 'node:assert'
import { after, before, beforeEach, describe, test } from 'node:test'
import request from 'supertest'
import { Scope } from '../src/server/context'
import { tenantDb } from '../src/server/multitenant'
import prisma from '../src/utils/prisma'
import { auth, serviceAuth } from './mocks/auth'
import { resetDb, seedGroup, seedGroupAdmin, seedMember, seedMemberUser } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'
import { includedResource, toUuid } from './mocks/utils'

let app: any

before(async () => {
  const server = await setupTestServer()
  app = server.app
})

after(async () => {
  await teardownTestServer()
})

describe('Member-user endpoints', () => {
  beforeEach(async () => {
    await resetDb()
  })

  test('member-user endpoints require JWT', async () => {
    const id = toUuid('member-user-no-auth')

    await request(app)
      .get('/member-user-auth/member-users')
      .expect(401)

    await request(app)
      .get(`/member-user-auth/member-users/${id}`)
      .expect(401)

    await request(app)
      .patch(`/member-user-auth/member-users/${id}`)
      .send({
        data: {
          type: 'member-users',
          attributes: {},
        },
      })
      .expect(401)
  })

  test('owners can list and read only their own relations', async () => {
    const owner = await auth('member-user-owner')
    const other = await auth('member-user-other')
    await seedGroup({ tenantId: 'member-user-owner-group' })
    const member = await seedMember({
      tenantId: 'member-user-owner-group',
      userId: owner.id,
    })
    await seedMember({
      tenantId: 'member-user-owner-group',
      userId: other.id,
    })
    const relation = await tenantDb(prisma, 'member-user-owner-group').memberUser.findFirstOrThrow({
      where: { memberId: member.id, userId: owner.id },
    })

    const collection = await request(app)
      .get('/member-user-owner-group/member-users')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(collection.body.meta.count, 1)
    assert.strictEqual(collection.body.data.length, 1)
    assert.strictEqual(collection.body.data[0].id, relation.id)
    assert.deepStrictEqual(collection.body.data[0].attributes, {
      notifications: {
        myAccount: true,
        group: true,
      },
      emails: {
        myAccount: true,
        group: 'monthly',
      },
    })
    assert.deepStrictEqual(collection.body.data[0].relationships.user.data, {
      type: 'users',
      id: owner.id,
    })
    assert.deepStrictEqual(collection.body.data[0].relationships.member.data, {
      type: 'members',
      id: member.id,
    })

    const detail = await request(app)
      .get(`/member-user-owner-group/member-users/${relation.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(detail.body.data.id, relation.id)

    const otherRelation = await tenantDb(prisma, 'member-user-owner-group').memberUser.findFirstOrThrow({
      where: { userId: other.id },
    })
    await request(app)
      .get(`/member-user-owner-group/member-users/${otherRelation.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403)

    await request(app)
      .get(`/member-user-owner-group/member-users?filter[user]=${other.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(403)
  })

  test('collection supports comma-separated filters, includes, and pagination', async () => {
    const firstUser = await auth('member-user-filter-first')
    const secondUser = await auth('member-user-filter-second')
    await seedGroup({ tenantId: 'member-user-filter-group' })
    const firstMember = await seedMember({
      tenantId: 'member-user-filter-group',
      userId: firstUser.id,
    })
    const secondMember = await seedMember({
      tenantId: 'member-user-filter-group',
      userId: secondUser.id,
    })
    await seedMember({ tenantId: 'member-user-filter-group' })
    const service = await serviceAuth()

    const response = await request(app)
      .get(`/member-user-filter-group/member-users?filter[user]=${firstUser.id},${secondUser.id}&filter[member]=${firstMember.id},${secondMember.id}&include=user,member&page[size]=1`)
      .set('Authorization', `Bearer ${service.token}`)
      .expect(200)

    assert.strictEqual(response.body.meta.count, 2)
    assert.strictEqual(response.body.data.length, 1)
    assert.strictEqual(typeof response.body.links.next, 'string')
    const resource = response.body.data[0]
    assert.ok(includedResource(response.body, 'users', resource.relationships.user.data.id))
    assert.ok(includedResource(response.body, 'members', resource.relationships.member.data.id))

    await request(app)
      .get('/member-user-filter-group/member-users?filter[user]=not-a-uuid')
      .set('Authorization', `Bearer ${service.token}`)
      .expect(400)
  })

  test('owners can patch settings with a nested merge', async () => {
    const owner = await auth('member-user-patch-owner')
    await seedGroup({ tenantId: 'member-user-patch-group' })
    const member = await seedMember({
      tenantId: 'member-user-patch-group',
      userId: owner.id,
    })
    const relation = await tenantDb(prisma, 'member-user-patch-group').memberUser.findFirstOrThrow({
      where: { memberId: member.id, userId: owner.id },
    })

    const response = await request(app)
      .patch(`/member-user-patch-group/member-users/${relation.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'member-users',
          id: relation.id,
          attributes: {
            notifications: {
              group: false,
            },
            emails: {
              myAccount: false,
            },
          },
        },
      })
      .expect(200)

    assert.deepStrictEqual(response.body.data.attributes, {
      notifications: {
        myAccount: true,
        group: false,
      },
      emails: {
        myAccount: false,
        group: 'monthly',
      },
    })

    const stored = await tenantDb(prisma, 'member-user-patch-group').memberUser.findUniqueOrThrow({
      where: { id: relation.id },
    })
    assert.deepStrictEqual(stored.settings, response.body.data.attributes)
  })

  test('PATCH rejects immutable relationships, unknown attributes, and mismatched ids', async () => {
    const owner = await auth('member-user-immutable-owner')
    await seedGroup({ tenantId: 'member-user-immutable-group' })
    const member = await seedMember({
      tenantId: 'member-user-immutable-group',
      userId: owner.id,
    })
    const relation = await tenantDb(prisma, 'member-user-immutable-group').memberUser.findFirstOrThrow({
      where: { memberId: member.id, userId: owner.id },
    })
    const path = `/member-user-immutable-group/member-users/${relation.id}`

    await request(app)
      .patch(path)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'member-users',
          attributes: {},
          relationships: {
            user: {
              data: { type: 'users', id: owner.id },
            },
          },
        },
      })
      .expect(400)

    await request(app)
      .patch(path)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'member-users',
          attributes: {
            role: 'admin',
          },
        },
      })
      .expect(400)

    await request(app)
      .patch(path)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'member-users',
          id: toUuid('different-member-user-id'),
          attributes: {},
        },
      })
      .expect(400)
  })

  test('group admins can read and patch all relations in their group', async () => {
    const owner = await auth('member-user-admin-target')
    const admin = await auth('member-user-group-admin')
    await seedGroup({ tenantId: 'member-user-admin-group' })
    await seedGroupAdmin({
      tenantId: 'member-user-admin-group',
      userId: admin.id,
    })
    const member = await seedMember({
      tenantId: 'member-user-admin-group',
      userId: owner.id,
    })
    const relation = await tenantDb(prisma, 'member-user-admin-group').memberUser.findFirstOrThrow({
      where: { memberId: member.id, userId: owner.id },
    })

    const collection = await request(app)
      .get('/member-user-admin-group/member-users')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(collection.body.meta.count, 1)

    const response = await request(app)
      .patch(`/member-user-admin-group/member-users/${relation.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'member-users',
          attributes: {
            emails: {
              group: 'weekly',
            },
          },
        },
      })
      .expect(200)

    assert.strictEqual(response.body.data.attributes.emails.group, 'weekly')
  })

  test('superadmins and services can read all relations without crossing tenants', async () => {
    const owner = await auth('member-user-privileged-owner')
    await seedGroup({ tenantId: 'member-user-first-tenant' })
    await seedGroup({ tenantId: 'member-user-second-tenant' })
    const firstMember = await seedMember({
      tenantId: 'member-user-first-tenant',
      userId: owner.id,
    })
    await seedMember({
      tenantId: 'member-user-second-tenant',
      userId: owner.id,
    })
    const firstRelation = await tenantDb(prisma, 'member-user-first-tenant').memberUser.findFirstOrThrow({
      where: { memberId: firstMember.id, userId: owner.id },
    })
    const superadmin = await auth('member-user-superadmin', undefined, Scope.Superadmin)
    const service = await serviceAuth()

    for (const token of [superadmin.token, service.token]) {
      const response = await request(app)
        .get(`/member-user-first-tenant/member-users?filter[user]=${owner.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200)

      assert.strictEqual(response.body.meta.count, 1)

      await request(app)
        .get(`/member-user-second-tenant/member-users/${firstRelation.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404)
    }
  })

  test('outsiders cannot access a group member-user collection', async () => {
    const owner = await auth('member-user-outsider-owner')
    const outsider = await auth('member-user-outsider')
    await seedGroup({ tenantId: 'member-user-outsider-group' })
    await seedMember({
      tenantId: 'member-user-outsider-group',
      userId: owner.id,
    })

    await request(app)
      .get('/member-user-outsider-group/member-users')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)
  })

  test('member-user relations cannot be created or deleted through the API', async () => {
    const owner = await auth('member-user-read-only-resource')
    await seedGroup({ tenantId: 'member-user-read-only-group' })
    const member = await seedMember({
      tenantId: 'member-user-read-only-group',
      userId: owner.id,
    })
    const relation = await tenantDb(prisma, 'member-user-read-only-group').memberUser.findFirstOrThrow({
      where: { memberId: member.id, userId: owner.id },
    })

    await request(app)
      .post('/member-user-read-only-group/member-users')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'member-users',
          attributes: {},
        },
      })
      .expect(404)

    await request(app)
      .delete(`/member-user-read-only-group/member-users/${relation.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404)
  })
})
