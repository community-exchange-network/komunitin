import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { auth } from './mocks/auth'
import {
  resetDb,
  seedCategory,
  seedGroup,
  seedGroupAdmin,
  seedMember,
  seedMemberUser,
  seedPost,
} from './mocks/seed'
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

const postInput = (type: 'offers' | 'needs', attributes: any, memberId: string, categoryId?: string) => ({
  data: {
    type,
    attributes,
    relationships: {
      member: { data: { type: 'members', id: memberId } },
      ...(categoryId ? { category: { data: { type: 'categories', id: categoryId } } } : {})
    }
  }
})
describe('Posts endpoints', () => {
  beforeEach(async () => {
    await resetDb()
  })

  test('POST /:code/posts requires JWT', async () => {
    await seedGroup({ tenantId: 'posts-auth', status: 'active', access: 'public' })

    await request(app)
      .post('/posts-auth/posts')
      .send(postInput('offers', { title: 'A bicycle', description: 'A great bike.' }, toUuid('some-member-id')))
      .expect(401)
  })

  test('POST /:code/posts requires user to have a member in group', async () => {
    await seedGroup({ tenantId: 'posts-no-member', status: 'active', access: 'public' })
    const user = await auth('posts-no-member-user')
    const member = await seedMember({ tenantId: 'posts-no-member', status: 'active', userId: user.id })

    const user2 = await auth('posts-no-member-user2')

    await request(app)
      .post('/posts-no-member/posts')
      .set('Authorization', `Bearer ${user2.token}`)
      .send(postInput('offers', { title: 'A bicycle', description: 'A great bike.' }, member.id))
      .expect(403)
  })

  test('POST /:code/posts creates an offer with code slugified from title', async () => {
    await seedGroup({ tenantId: 'posts-create', status: 'active', access: 'public' })
    const user = await auth('posts-create-user')
    const member = await seedMember({ tenantId: 'posts-create', status: 'active', userId: user.id })

    const res = await request(app)
      .post('/posts-create/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('offers', { title: 'Nice Bicycle', description: 'A great bike.', value: '50 XYZ' }, member.id))
      .expect(201)

    assert.strictEqual(res.body.data.type, 'offers')
    assert.strictEqual(res.body.data.attributes.title, 'Nice Bicycle')
    assert.strictEqual(res.body.data.attributes.code, 'nice-bicycle')
    assert.strictEqual(res.body.data.attributes.status, 'draft')
    assert.strictEqual(res.body.data.relationships.member.data.id, member.id)
  })

  test('POST /:code/posts creates a need', async () => {
    await seedGroup({ tenantId: 'posts-need', status: 'active', access: 'public' })
    const user = await auth('posts-need-user')
    const member = await seedMember({ tenantId: 'posts-need', status: 'active', userId: user.id })

    const res = await request(app)
      .post('/posts-need/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('needs', { description: 'Looking for a plumber' }, member.id))
      .expect(201)

    assert.strictEqual(res.body.data.type, 'needs')
    assert.strictEqual(res.body.data.attributes.code, 'looking-for-a-plumber')
  })

  test('POST /:code/posts generates unique code on collision', async () => {
    await seedGroup({ tenantId: 'posts-collision', status: 'active', access: 'public' })
    const user = await auth('posts-collision-user')
    const member = await seedMember({ tenantId: 'posts-collision', status: 'active', userId: user.id })
    await seedPost({ tenantId: 'posts-collision', memberId: member.id, code: 'my-offer', type: 'offers', title: 'My offer' })

    const res = await request(app)
      .post('/posts-collision/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('offers', { title: 'My offer', description: 'My offer description' }, member.id))
      .expect(201)

    assert.strictEqual(res.body.data.attributes.code, 'my-offer-2')
  })

  test('POST /:code/posts with category relationship', async () => {
    await seedGroup({ tenantId: 'posts-category', status: 'active', access: 'public' })
    const user = await auth('posts-category-user')
    const member = await seedMember({ tenantId: 'posts-category', status: 'active', userId: user.id })
    const category = await seedCategory({ tenantId: 'posts-category' })

    const res = await request(app)
      .post('/posts-category/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('offers', { title: 'Categorized offer', description: 'Offer with category.' }, member.id, category.id))
      .expect(201)

    assert.strictEqual(res.body.data.relationships.category.data.id, category.id)
  })

  test('GET /:code/posts returns only public posts to anonymous users', async () => {
    await seedGroup({ tenantId: 'posts-anon', status: 'active', access: 'public' })
    const owner = await auth('posts-anon-owner')
    const member = await seedMember({ tenantId: 'posts-anon', status: 'active', userId: owner.id })

    await seedPost({ tenantId: 'posts-anon', memberId: member.id, code: 'public-offer', type: 'offers', status: 'published', access: 'public' })
    await seedPost({ tenantId: 'posts-anon', memberId: member.id, code: 'group-offer', type: 'offers', status: 'published', access: 'group' })
    await seedPost({ tenantId: 'posts-anon', memberId: member.id, code: 'draft-offer', type: 'offers', status: 'draft', access: 'public' })
    await seedPost({ tenantId: 'posts-anon', memberId: member.id, code: 'hidden-offer', type: 'offers', status: 'hidden', access: 'public' })

    const res = await request(app)
      .get('/posts-anon/posts')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'public-offer')
  })

  test('GET /:code/posts returns group-access posts to group members', async () => {
    await seedGroup({ tenantId: 'posts-group-access', status: 'active', access: 'public' })
    const owner = await auth('posts-group-access-owner')
    const groupMember = await auth('posts-group-access-gm')
    const outsider = await auth('posts-group-access-outsider')

    const member = await seedMember({ tenantId: 'posts-group-access', status: 'active', userId: owner.id })
    await seedMember({ tenantId: 'posts-group-access', status: 'active', userId: groupMember.id })

    await seedPost({ tenantId: 'posts-group-access', memberId: member.id, code: 'public-p', type: 'offers', status: 'published', access: 'public' })
    await seedPost({ tenantId: 'posts-group-access', memberId: member.id, code: 'group-p', type: 'offers', status: 'published', access: 'group' })

    const memberRes = await request(app)
      .get('/posts-group-access/posts')
      .set('Authorization', `Bearer ${groupMember.token}`)
      .expect(200)

    assert.strictEqual(memberRes.body.data.length, 2)

    const outsiderRes = await request(app)
      .get('/posts-group-access/posts')
      .set('Authorization', `Bearer ${outsider.token}`)
      .expect(200)

    assert.strictEqual(outsiderRes.body.data.length, 1)
    assert.strictEqual(outsiderRes.body.data[0].attributes.code, 'public-p')
  })

  test('GET /:code/posts owner sees own draft posts', async () => {
    await seedGroup({ tenantId: 'posts-owner-draft', status: 'active', access: 'public' })
    const owner = await auth('posts-owner-draft-user')
    const other = await auth('posts-owner-draft-other')
    const member = await seedMember({ tenantId: 'posts-owner-draft', status: 'active', userId: owner.id })
    const otherMember = await seedMember({ tenantId: 'posts-owner-draft', status: 'active', userId: other.id })

    await seedPost({ tenantId: 'posts-owner-draft', memberId: member.id, code: 'my-draft', type: 'offers', status: 'draft', access: 'public' })
    await seedPost({ tenantId: 'posts-owner-draft', memberId: otherMember.id, code: 'other-draft', type: 'offers', status: 'draft', access: 'public' })

    const res = await request(app)
      .get('/posts-owner-draft/posts')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'my-draft')
  })

  test('GET /:code/posts?filter[type]=offers returns only offers', async () => {
    await seedGroup({ tenantId: 'posts-filter-type', status: 'active', access: 'public' })
    const user = await auth('posts-filter-type-user')
    const member = await seedMember({ tenantId: 'posts-filter-type', status: 'active', userId: user.id })

    await seedPost({ tenantId: 'posts-filter-type', memberId: member.id, code: 'offer-1', type: 'offers', status: 'published' })
    await seedPost({ tenantId: 'posts-filter-type', memberId: member.id, code: 'need-1', type: 'needs', status: 'published' })

    const res = await request(app)
      .get('/posts-filter-type/posts?filter[type]=offers')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].type, 'offers')
  })

  test('GET /:code/posts supports search across post data and member search fields', async () => {
    await seedGroup({ tenantId: 'posts-search', status: 'active', access: 'public' })
    const owner = await auth('posts-search-owner')
    const member = await seedMember({
      tenantId: 'posts-search',
      status: 'active',
      userId: owner.id,
      code: 'member-alpha',
      name: 'Olivia Rivera',
      address: {
        addressLocality: 'Riverdale',
      },
    })

    await seedPost({
      tenantId: 'posts-search',
      memberId: member.id,
      code: 'offer-bike',
      type: 'offers',
      title: 'Bike Repair Help',
      description: 'Repair and tune-up',
      status: 'published',
      access: 'public',
      data: {
        value: '20 credits per hour',
      } as any,
    })

    await seedPost({
      tenantId: 'posts-search',
      memberId: member.id,
      code: 'offer-garden',
      type: 'offers',
      title: 'Garden Assistance',
      description: 'Plant care',
      status: 'published',
      access: 'public',
      data: {
        value: 'garden support',
      } as any,
    })

    const byTitle = await request(app)
      .get('/posts-search/posts?filter[search]=bikes')
      .expect(200)

    assert.strictEqual(byTitle.body.data.length, 1)
    assert.strictEqual(byTitle.body.data[0].attributes.code, 'offer-bike')

    const byMemberName = await request(app)
      .get('/posts-search/posts?filter[search]=olivia')
      .expect(200)

    assert.strictEqual(byMemberName.body.data.length, 2)

    const byMemberCode = await request(app)
      .get('/posts-search/posts?filter[search]=member-alpha')
      .expect(200)

    assert.strictEqual(byMemberCode.body.data.length, 2)

    const byMemberAddress = await request(app)
      .get('/posts-search/posts?filter[search]=riverdale')
      .expect(200)

    assert.strictEqual(byMemberAddress.body.data.length, 2)

    const byDescription = await request(app)
      .get('/posts-search/posts?filter[search]=tune')
      .expect(200)

    assert.strictEqual(byDescription.body.data.length, 1)
    assert.strictEqual(byDescription.body.data[0].attributes.code, 'offer-bike')

    const byFlattenedData = await request(app)
      .get('/posts-search/posts?filter[search]=20 credits per hour')
      .expect(200)

    assert.strictEqual(byFlattenedData.body.data.length, 1)
    assert.strictEqual(byFlattenedData.body.data[0].attributes.code, 'offer-bike')

    const byJsonKey = await request(app)
      .get('/posts-search/posts?filter[search]=addressLocality')
      .expect(200)

    assert.strictEqual(byJsonKey.body.data.length, 0)
  })

  test('GET /:code/posts paginates after visibility filtering', async () => {
    await seedGroup({ tenantId: 'posts-page', status: 'active', access: 'public' })
    const owner = await auth('posts-page-owner')
    const member = await seedMember({ tenantId: 'posts-page', status: 'active', userId: owner.id })

    await seedPost({ tenantId: 'posts-page', memberId: member.id, code: 'a-hidden', type: 'offers', status: 'draft', access: 'public' })
    await seedPost({ tenantId: 'posts-page', memberId: member.id, code: 'b-visible', type: 'offers', status: 'published', access: 'public' })

    const res = await request(app)
      .get('/posts-page/posts?sort=code&page[size]=1')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'b-visible')
  })

  test('GET /:code/posts/:post returns a single post', async () => {
    await seedGroup({ tenantId: 'posts-get-one', status: 'active', access: 'public' })
    const user = await auth('posts-get-one-user')
    const member = await seedMember({ tenantId: 'posts-get-one', status: 'active', userId: user.id })
    const post = await seedPost({ tenantId: 'posts-get-one', memberId: member.id, type: 'offers', status: 'published', access: 'public' })

    const res = await request(app)
      .get(`/posts-get-one/posts/${post.id}`)
      .expect(200)

    assert.strictEqual(res.body.data.id, post.id)
    assert.strictEqual(res.body.data.type, 'offers')
  })

  test('GET /:code/posts/:post returns 403 for unauthorized draft', async () => {
    await seedGroup({ tenantId: 'posts-get-forbidden', status: 'active', access: 'public' })
    const user = await auth('posts-get-forbidden-user')
    const member = await seedMember({ tenantId: 'posts-get-forbidden', status: 'active', userId: user.id })
    const post = await seedPost({ tenantId: 'posts-get-forbidden', memberId: member.id, type: 'offers', status: 'draft', access: 'public' })

    await request(app)
      .get(`/posts-get-forbidden/posts/${post.id}`)
      .expect(403)
  })

  test('PATCH /:code/posts/:post requires JWT', async () => {
    await seedGroup({ tenantId: 'posts-patch-auth', status: 'active', access: 'public' })
    const user = await auth('posts-patch-auth-user')
    const member = await seedMember({ tenantId: 'posts-patch-auth', status: 'active', userId: user.id })
    const post = await seedPost({ tenantId: 'posts-patch-auth', memberId: member.id, type: 'offers', status: 'draft' })

    await request(app)
      .patch(`/posts-patch-auth/posts/${post.id}`)
      .send({ data: { type: 'offers', attributes: { title: 'Updated' } } })
      .expect(401)
  })

  test('PATCH /:code/posts/:post updates post as owner', async () => {
    await seedGroup({ tenantId: 'posts-patch', status: 'active', access: 'public' })
    const user = await auth('posts-patch-user')
    const member = await seedMember({ tenantId: 'posts-patch', status: 'active', userId: user.id })
    const post = await seedPost({ tenantId: 'posts-patch', memberId: member.id, type: 'offers', status: 'draft', title: 'Old title' })

    const res = await request(app)
      .patch(`/posts-patch/posts/${post.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ data: { type: 'offers', attributes: { title: 'New title' } } })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.title, 'New title')
  })

  test('PATCH /:code/posts/:post forbids edit by non-owner', async () => {
    await seedGroup({ tenantId: 'posts-patch-forbidden', status: 'active', access: 'public' })
    const owner = await auth('posts-patch-forbidden-owner')
    const other = await auth('posts-patch-forbidden-other')
    const member = await seedMember({ tenantId: 'posts-patch-forbidden', status: 'active', userId: owner.id })
    await seedMember({ tenantId: 'posts-patch-forbidden', status: 'active', userId: other.id })
    const post = await seedPost({ tenantId: 'posts-patch-forbidden', memberId: member.id, type: 'offers', status: 'draft' })

    await request(app)
      .patch(`/posts-patch-forbidden/posts/${post.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ data: { type: 'offers', attributes: { title: 'Hack' } } })
      .expect(403)
  })

  test('PATCH /:code/posts/:post allows status transition draft→published by owner', async () => {
    await seedGroup({ tenantId: 'posts-status', status: 'active', access: 'public' })
    const user = await auth('posts-status-user')
    const member = await seedMember({ tenantId: 'posts-status', status: 'active', userId: user.id })
    const post = await seedPost({ tenantId: 'posts-status', memberId: member.id, type: 'offers', status: 'draft' })

    const res = await request(app)
      .patch(`/posts-status/posts/${post.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ data: { type: 'offers', attributes: { status: 'published' } } })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.status, 'published')
  })

  test('PATCH /:code/posts/:post rejects invalid status transition', async () => {
    await seedGroup({ tenantId: 'posts-status-invalid', status: 'active', access: 'public' })
    const user = await auth('posts-status-invalid-user')
    const member = await seedMember({ tenantId: 'posts-status-invalid', status: 'active', userId: user.id })
    const post = await seedPost({ tenantId: 'posts-status-invalid', memberId: member.id, type: 'offers', status: 'published' })

    await request(app)
      .patch(`/posts-status-invalid/posts/${post.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ data: { type: 'offers', attributes: { status: 'draft' } } })
      .expect(400)
  })

  test('PATCH /:code/posts/:post admin can edit any post', async () => {
    await seedGroup({ tenantId: 'posts-admin-edit', status: 'active', access: 'public' })
    const owner = await auth('posts-admin-edit-owner')
    const admin = await auth('posts-admin-edit-admin')
    const member = await seedMember({ tenantId: 'posts-admin-edit', status: 'active', userId: owner.id })
    await seedGroupAdmin({ tenantId: 'posts-admin-edit', userId: admin.id })
    const post = await seedPost({ tenantId: 'posts-admin-edit', memberId: member.id, type: 'offers', status: 'draft' })

    const res = await request(app)
      .patch(`/posts-admin-edit/posts/${post.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ data: { type: 'offers', attributes: { title: 'Admin edited' } } })
      .expect(200)

    assert.strictEqual(res.body.data.attributes.title, 'Admin edited')
  })

  test('DELETE /:code/posts/:post soft-deletes as owner', async () => {
    await seedGroup({ tenantId: 'posts-delete', status: 'active', access: 'public' })
    const user = await auth('posts-delete-user')
    const member = await seedMember({ tenantId: 'posts-delete', status: 'active', userId: user.id })
    const post = await seedPost({ tenantId: 'posts-delete', memberId: member.id, type: 'offers', status: 'published', access: 'public' })

    await request(app)
      .delete(`/posts-delete/posts/${post.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(204)

    // Verify it's no longer visible
    await request(app)
      .get(`/posts-delete/posts/${post.id}`)
      .expect(404)
  })

  test('DELETE /:code/posts/:post forbids non-owner', async () => {
    await seedGroup({ tenantId: 'posts-delete-forbidden', status: 'active', access: 'public' })
    const owner = await auth('posts-delete-forbidden-owner')
    const other = await auth('posts-delete-forbidden-other')
    const member = await seedMember({ tenantId: 'posts-delete-forbidden', status: 'active', userId: owner.id })
    await seedMember({ tenantId: 'posts-delete-forbidden', status: 'active', userId: other.id })
    const post = await seedPost({ tenantId: 'posts-delete-forbidden', memberId: member.id, type: 'offers', status: 'published', access: 'public' })

    await request(app)
      .delete(`/posts-delete-forbidden/posts/${post.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(403)
  })
})
