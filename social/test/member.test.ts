import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { auth } from './mocks/auth'
import { resetDb, seedGroup, seedGroupAdmin, seedMember, seedMemberUser } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'

let app: any

before(async () => {
  const server = await setupTestServer()
  app = server.app
})

after(async () => {
  await teardownTestServer()
})

describe('Members endpoints', () => {
  beforeEach(async () => {
    await resetDb()
  })

  test('POST /:code/members requires JWT', async () => {
    await seedGroup({ tenantId: 'members-auth', status: 'active', access: 'public' })

    await request(app)
      .post('/members-auth/members')
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'New Member',
          },
        },
      })
      .expect(401)
  })

  test('POST /:code/members creates draft member linked to authenticated user', async () => {
    await seedGroup({ tenantId: 'members-create', status: 'active', access: 'public' })
    const user = await auth('member-create-user')

    const res = await request(app)
      .post('/members-create/members')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'Alice Member',
            description: 'Member description',
          },
        },
      })
      .expect(201)

    assert.strictEqual(res.body.data.type, 'members')
    assert.strictEqual(res.body.data.attributes.name, 'Alice Member')
    assert.strictEqual(res.body.data.attributes.status, 'draft')
    assert.strictEqual(res.body.data.attributes.code, 'members-create0000')

    const list = await request(app)
      .get('/members-create/members')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200)

    assert.strictEqual(list.body.data.length, 0)

    const draftList = await request(app)
      .get('/members-create/members?filter[status]=draft')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200)

    assert.strictEqual(draftList.body.data.length, 1)
    assert.strictEqual(draftList.body.data[0].attributes.name, 'Alice Member')
  })

  test('POST /:code/members accepts explicit code only if admin', async () => {
    await seedGroup({ tenantId: 'members-create-code', status: 'active', access: 'public' })
    const user = await auth('member-create-code-user')
    const admin = await auth('member-create-code-admin')
    await seedGroupAdmin({ tenantId: 'members-create-code', userId: admin.id })

    const data = {
        data: {
          type: 'members',
          attributes: {
            code: 'custom-member',
            name: 'Custom Member',
          },
        },
      }

    await request(app)
      .post('/members-create-code/members')
      .set('Authorization', `Bearer ${user.token}`)
      .send(data)
      .expect(400)
    
    const adminRes = await request(app)
      .post('/members-create-code/members')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(data)
      .expect(201)

    assert.strictEqual(adminRes.body.data.attributes.code, 'custom-member')
  })

  test('GET /:code/members returns only active public members to anonymous users', async () => {
    await seedGroup({ tenantId: 'members-list-anon', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-list-anon', code: 'public-active', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-list-anon', code: 'group-active', status: 'active', access: 'group' })
    await seedMember({ tenantId: 'members-list-anon', code: 'public-pending', status: 'pending', access: 'public' })

    const res = await request(app)
      .get('/members-list-anon/members')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'public-active')
  })

  test('GET /:code/members defaults to active status and still allows owner to request drafts explicitly', async () => {
    await seedGroup({ tenantId: 'members-list-owner', status: 'active', access: 'public' })
    const owner = await auth('member-owner')
    const outsider = await auth('member-outsider')

    await seedMember({
      tenantId: 'members-list-owner',
      code: 'owner-draft',
      status: 'draft',
      access: 'private',
      userId: owner.id,
    })

    const ownerDefaultRes = await request(app)
      .get('/members-list-owner/members')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(ownerDefaultRes.body.data.length, 0)

    const ownerDraftRes = await request(app)
      .get('/members-list-owner/members?filter[status]=draft')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(ownerDraftRes.body.data.length, 1)
    assert.strictEqual(ownerDraftRes.body.data[0].attributes.code, 'owner-draft')

    const outsiderRes = await request(app)
      .get('/members-list-owner/members?filter[status]=draft')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(200)

    assert.strictEqual(outsiderRes.body.data.length, 0)
  })

  test('GET /:code/members returns all members to group admin', async () => {
    await seedGroup({ tenantId: 'members-list-admin', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-list-admin', code: 'draft-one', status: 'draft', access: 'private' })
    await seedMember({ tenantId: 'members-list-admin', code: 'pending-two', status: 'pending', access: 'private' })
    await seedMember({ tenantId: 'members-list-admin', code: 'active-three', status: 'active', access: 'group' })

    const admin = await auth('member-admin')
    await seedGroupAdmin({ tenantId: 'members-list-admin', userId: admin.id })

    const res = await request(app)
      .get('/members-list-admin/members?filter[status]=draft,active,pending')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 3)
  })

  test('GET /:code/members/:member enforces access control', async () => {
    await seedGroup({ tenantId: 'members-get-one', status: 'active', access: 'public' })
    const publicMember = await seedMember({
      tenantId: 'members-get-one',
      code: 'visible',
      status: 'active',
      access: 'public',
    })
    const privateDraft = await seedMember({
      tenantId: 'members-get-one',
      code: 'hidden',
      status: 'draft',
      access: 'private',
    })

    await request(app)
      .get(`/members-get-one/members/${publicMember.id}`)
      .expect(200)

    await request(app)
      .get(`/members-get-one/members/${privateDraft.id}`)
      .expect(403)
  })

  test('PATCH /:code/members/:member allows member user to update attributes', async () => {
    await seedGroup({ tenantId: 'members-patch-owner', status: 'active', access: 'public' })
    const owner = await auth('member-patch-owner')
    const member = await seedMember({
      tenantId: 'members-patch-owner',
      code: 'patch-owner',
      status: 'draft',
      access: 'private',
      userId: owner.id,
    })

    const res = await request(app)
      .patch(`/members-patch-owner/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'Updated Member',
            description: 'Updated description',
          },
        },
      })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.name, 'Updated Member')
    assert.strictEqual(res.body.data.attributes.description, 'Updated description')
  })

  test('PATCH /:code/members/:member allows draft to pending by owner', async () => {
    await seedGroup({ tenantId: 'members-submit', status: 'active', access: 'public' })
    const owner = await auth('member-submit-owner')
    const member = await seedMember({
      tenantId: 'members-submit',
      code: 'submit-me',
      status: 'draft',
      userId: owner.id,
    })

    const res = await request(app)
      .patch(`/members-submit/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'pending',
          },
        },
      })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.status, 'pending')
  })

  test('PATCH /:code/members/:member allows pending to active by admin only', async () => {
    await seedGroup({ tenantId: 'members-approve', status: 'active', access: 'public' })
    const owner = await auth('member-approve-owner')
    const admin = await auth('member-approve-admin')
    await seedGroupAdmin({ tenantId: 'members-approve', userId: admin.id })

    const member = await seedMember({
      tenantId: 'members-approve',
      code: 'approve-me',
      status: 'pending',
      userId: owner.id,
    })

    await request(app)
      .patch(`/members-approve/members/${member.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'active',
          },
        },
      })
      .expect(400)

    const approved = await request(app)
      .patch(`/members-approve/members/${member.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            status: 'active',
          },
        },
      })
      .expect(200)

    assert.strictEqual(approved.body.data.attributes.status, 'active')
  })

  test('PATCH /:code/members/:member denies non-member and non-admin', async () => {
    await seedGroup({ tenantId: 'members-patch-deny', status: 'active', access: 'public' })
    const owner = await auth('member-patch-owner-deny')
    const outsider = await auth('member-patch-outsider-deny')

    const member = await seedMember({
      tenantId: 'members-patch-deny',
      code: 'deny-me',
      status: 'draft',
      userId: owner.id,
    })

    await request(app)
      .patch(`/members-patch-deny/members/${member.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'Should Fail',
          },
        },
      })
      .expect(403)
  })

  test('GET /:code/members supports filtering and sorting', async () => {
    await seedGroup({ tenantId: 'members-query', status: 'active', access: 'public' })
    const admin = await auth('members-query-admin')
    await seedGroupAdmin({ tenantId: 'members-query', userId: admin.id })

    await seedMember({ tenantId: 'members-query', code: 'a', name: 'Alpha', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-query', code: 'b', name: 'Beta', status: 'pending', access: 'private' })
    await seedMember({ tenantId: 'members-query', code: 'c', name: 'Gamma', status: 'draft', access: 'private' })

    const res = await request(app)
      .get('/members-query/members?sort=name&filter[status]=pending')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'b')
  })

  test('GET /:code/members supports search across text and JSON scalar values', async () => {
    await seedGroup({ tenantId: 'members-search', status: 'active', access: 'public' })
    await seedMember({
      tenantId: 'members-search',
      code: 'alpha-code',
      name: 'Alpha Person',
      status: 'active',
      access: 'public',
      address: {
        addressLocality: 'Riverdale',
      },
      contacts: [
        { type: 'email', value: 'alpha@example.org' },
      ],
    })
    await seedMember({
      tenantId: 'members-search',
      code: 'bravo-code',
      name: 'Bravo Person',
      status: 'active',
      access: 'public',
    })

    const byName = await request(app)
      .get('/members-search/members?filter[search]=alpha')
      .expect(200)

    assert.strictEqual(byName.body.data.length, 1)
    assert.strictEqual(byName.body.data[0].attributes.code, 'alpha-code')

    const byAddressValue = await request(app)
      .get('/members-search/members?filter[search]=riverdale')
      .expect(200)

    assert.strictEqual(byAddressValue.body.data.length, 1)
    assert.strictEqual(byAddressValue.body.data[0].attributes.code, 'alpha-code')

    const byAddressKey = await request(app)
      .get('/members-search/members?filter[search]=addressLocality')
      .expect(200)

    assert.strictEqual(byAddressKey.body.data.length, 0)
  })

  test('GET /:code/members paginates after visibility filtering', async () => {
    await seedGroup({ tenantId: 'members-page', status: 'active', access: 'public' })
    await seedMember({ tenantId: 'members-page', code: 'hidden', name: 'Alpha', status: 'draft', access: 'public' })
    await seedMember({ tenantId: 'members-page', code: 'visible', name: 'Bravo', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/members-page/members?sort=name&page[size]=1')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'visible')
  })

  test('PATCH /:code/members/:member returns 404 for unknown id', async () => {
    await seedGroup({ tenantId: 'members-missing', status: 'active', access: 'public' })
    const admin = await auth('members-missing-admin')
    await seedGroupAdmin({ tenantId: 'members-missing', userId: admin.id })

    await request(app)
      .patch('/members-missing/members/123')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        data: {
          type: 'members',
          attributes: {
            name: 'X',
          },
        },
      })
      .expect(404)
  })

  test('GET /:code/members/:member allows linked secondary member user', async () => {
    await seedGroup({ tenantId: 'members-linked-user', status: 'active', access: 'public' })
    const owner = await auth('members-linked-owner')
    const second = await auth('members-linked-second')
    const outsider = await auth('members-linked-outsider')

    const member = await seedMember({
      tenantId: 'members-linked-user',
      code: 'shared-member',
      status: 'draft',
      access: 'private',
      userId: owner.id,
    })

    await seedMemberUser({
      tenantId: 'members-linked-user',
      memberId: member.id,
      userId: second.id,
      role: 'admin',
    })

    await request(app)
      .get(`/members-linked-user/members/${member.id}`)
      .set('Authorization', `Bearer ${second.token}`)
      .expect(200)

    await request(app)
      .get(`/members-linked-user/members/${member.id}`)
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(403)
  })

  test('GET /:code/members/:member?include=group includes group data', async () => {
    await seedGroup({ tenantId: 'members-include-group', name: 'Included Group', status: 'active', access: 'public' })
    const member = await seedMember({
      tenantId: 'members-include-group',
      code: 'member-with-group',
      status: 'active',
      access: 'public',
    })

    const res = await request(app)
      .get(`/members-include-group/members/${member.id}?include=group`)
      .expect(200)

    assert.strictEqual(res.body.data.attributes.code, 'member-with-group')
    assert.strictEqual(res.body.included.length, 1)
    assert.strictEqual(res.body.included[0].type, 'groups')
    assert.strictEqual(res.body.included[0].attributes.code, 'members-include-group')
  })

  test('GET /:code/members?filter[code]=x&include=group returns filtered member with group included', async () => {
    await seedGroup({ tenantId: 'members-filter-include', name: 'Filter Include Group', status: 'active', access: 'public' })
    await seedMember({tenantId: 'members-filter-include', code: 'match', status: 'active', access: 'public' })
    await seedMember({tenantId: 'members-filter-include', code: 'other', status: 'active', access: 'public' })

    const res = await request(app)
      .get('/members-filter-include/members?filter[code]=match&include=group')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'match')
    assert.strictEqual(res.body.included.length, 1)
    assert.strictEqual(res.body.included[0].type, 'groups')
    assert.strictEqual(res.body.included[0].attributes.code, 'members-filter-include')
  })
})
