import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { tenantDb } from '../src/server/multitenant'
import { Scope } from '../src/server/context'
import prisma from '../src/utils/prisma'
import { auth } from './mocks/auth'
import {
  getNotificationsEvents,
  getNotificationsRequests,
  resetMockState,
  setNotificationsEventStatus,
} from './mocks/handlers'
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

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=',
  'base64',
)

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

const postQueryFixture = async (tenantId: string) => {
  const currencyId = toUuid(`${tenantId}-currency`)
  const memberAccountId = toUuid(`${tenantId}-account`)
  await seedGroup({ tenantId, status: 'active', access: 'public', currencyId })
  const admin = await auth(`${tenantId}-admin`)
  await seedGroupAdmin({ tenantId, userId: admin.id })
  const member = await seedMember({
    tenantId,
    code: `${tenantId}-member`,
    name: 'Query Member',
    status: 'active',
    access: 'public',
    accountId: memberAccountId,
    contacts: [
      { type: 'email', value: `${tenantId}@example.org` },
    ],
  })
  const otherMember = await seedMember({
    tenantId,
    code: `${tenantId}-other`,
    name: 'Other Member',
    status: 'active',
    access: 'public',
    accountId: toUuid(`${tenantId}-other-account`),
  })
  const category = await seedCategory({ tenantId, code: `${tenantId}-category`, name: 'Query Category' })

  return { admin, category, currencyId, member, memberAccountId, otherMember }
}

const includedResource = (body: any, type: string, id?: string) => {
  return body.included?.find((resource: any) => resource.type === type && (id === undefined || resource.id === id))
}

describe('Posts endpoints', () => {
  beforeEach(async () => {
    await resetDb()
    resetMockState()
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

  test('POST /:code/posts emits OfferPublished when created as published', async () => {
    await seedGroup({ tenantId: 'posts-create-published', status: 'active', access: 'public' })
    const user = await auth('posts-create-published-user')
    const member = await seedMember({ tenantId: 'posts-create-published', status: 'active', userId: user.id })

    await request(app)
      .post('/posts-create-published/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('offers', {
        title: 'Published Offer',
        description: 'A published offer',
        status: 'published',
      }, member.id))
      .expect(201)

    const requests = getNotificationsRequests()
    assert.strictEqual(requests.length, 1)
    assert.strictEqual(requests[0].method, 'POST')
    assert.strictEqual(requests[0].path, '/events')

    const events = getNotificationsEvents() as any[]
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].data.type, 'events')
    assert.strictEqual(events[0].data.attributes.name, 'OfferPublished')
    assert.strictEqual(events[0].data.attributes.source, 'social')
    assert.strictEqual(events[0].data.attributes.code, 'posts-create-published')
    assert.strictEqual(typeof events[0].data.attributes.time, 'string')
    assert.strictEqual(typeof events[0].data.attributes.data.offer, 'string')
    assert.strictEqual(events[0].data.relationships.user.data.type, 'users')
    assert.strictEqual(events[0].data.relationships.user.data.id, user.id)
  })

  test('POST /:code/posts does not emit notification for draft post creation', async () => {
    await seedGroup({ tenantId: 'posts-create-draft', status: 'active', access: 'public' })
    const user = await auth('posts-create-draft-user')
    const member = await seedMember({ tenantId: 'posts-create-draft', status: 'active', userId: user.id })

    await request(app)
      .post('/posts-create-draft/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('offers', {
        title: 'Draft Offer',
        description: 'A draft offer',
      }, member.id))
      .expect(201)

    assert.strictEqual(getNotificationsRequests().length, 0)
    assert.strictEqual(getNotificationsEvents().length, 0)
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

  test('POST, PATCH and DELETE /:code/posts sync post image files by URL', async () => {
    await seedGroup({ tenantId: 'posts-files', status: 'active', access: 'public' })
    const user = await auth('posts-files-user')
    const member = await seedMember({ tenantId: 'posts-files', status: 'active', userId: user.id })

    const firstUpload = await request(app)
      .post('/posts-files/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'offers')
      .attach('file', tinyPng, { filename: 'post-one.png', contentType: 'image/png' })
      .expect(201)

    const secondUpload = await request(app)
      .post('/posts-files/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'offers')
      .attach('file', tinyPng, { filename: 'post-two.png', contentType: 'image/png' })
      .expect(201)

    const firstUrl = firstUpload.body.data.attributes.url
    const secondUrl = secondUpload.body.data.attributes.url
    const db = tenantDb(prisma, 'posts-files')

    const created = await request(app)
      .post('/posts-files/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('offers', {
        title: 'Offer with images',
        description: 'Image sync description',
        images: [{ url: firstUrl, alt: 'Cover image' }],
      }, member.id))
      .expect(201)

    const postId = created.body.data.id
    assert.strictEqual(created.body.data.attributes.images[0].url, firstUrl)

    let files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    let fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(firstUrl)?.resourceId, postId)
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)

    const updated = await request(app)
      .patch(`/posts-files/posts/${postId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'offers',
          attributes: {
            images: [{ url: secondUrl, alt: 'Replacement image' }],
          },
        },
      })
      .expect(200)

    assert.strictEqual(updated.body.data.attributes.images[0].url, secondUrl)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(firstUrl)?.resourceId, null)
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, postId)

    await request(app)
      .delete(`/posts-files/posts/${postId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(204)

    files = await db.file.findMany({
      where: { url: { in: [firstUrl, secondUrl] } },
    })
    fileByUrl = new Map(files.map((file) => [file.url, file]))
    assert.strictEqual(fileByUrl.get(secondUrl)?.resourceId, null)
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

  test('GET /:code/posts allows read-all scope for unpublished posts in pending private group', async () => {
    await seedGroup({ tenantId: 'posts-read-all-list', status: 'pending', access: 'private' })
    const owner = await auth('posts-read-all-owner')
    const member = await seedMember({ tenantId: 'posts-read-all-list', status: 'draft', access: 'private', userId: owner.id })

    await seedPost({ tenantId: 'posts-read-all-list', memberId: member.id, code: 'draft-offer', type: 'offers', status: 'draft', access: 'private' })
    await seedPost({ tenantId: 'posts-read-all-list', memberId: member.id, code: 'hidden-offer', type: 'offers', status: 'hidden', access: 'group' })

    const serviceUser = await auth('posts-read-all-service', undefined, Scope.SocialReadAll)
    const res = await request(app)
      .get('/posts-read-all-list/posts?filter[status]=draft,hidden,published')
      .set('Authorization', `Bearer ${serviceUser.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 2)
    const codes = res.body.data.map((item: any) => item.attributes.code)
    assert.strictEqual(codes.includes('draft-offer'), true)
    assert.strictEqual(codes.includes('hidden-offer'), true)
  })

  test('GET /:code/posts/:post allows read-all scope for non-public post', async () => {
    await seedGroup({ tenantId: 'posts-read-all-one', status: 'pending', access: 'private' })
    const owner = await auth('posts-read-all-one-owner')
    const member = await seedMember({ tenantId: 'posts-read-all-one', status: 'draft', access: 'private', userId: owner.id })
    const post = await seedPost({
      tenantId: 'posts-read-all-one',
      memberId: member.id,
      code: 'private-draft-offer',
      type: 'offers',
      status: 'draft',
      access: 'private',
    })

    const serviceUser = await auth('posts-read-all-one-service', undefined, Scope.SocialReadAll)
    const res = await request(app)
      .get(`/posts-read-all-one/posts/${post.id}`)
      .set('Authorization', `Bearer ${serviceUser.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.id, post.id)
    assert.strictEqual(res.body.data.attributes.code, 'private-draft-offer')
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

  test('GET /:code/posts supports offer member/status/expired/category app query', async () => {
    const { admin, category, member, otherMember } = await postQueryFixture('posts-app-offer-filter')
    await seedPost({
      tenantId: 'posts-app-offer-filter',
      memberId: member.id,
      categoryId: category.id,
      code: 'published-current-offer',
      type: 'offers',
      status: 'published',
      access: 'public',
      expires: new Date('2999-01-01T00:00:00.000Z'),
    })
    await seedPost({
      tenantId: 'posts-app-offer-filter',
      memberId: member.id,
      categoryId: category.id,
      code: 'hidden-expired-offer',
      type: 'offers',
      status: 'hidden',
      access: 'private',
      expires: new Date('2000-01-01T00:00:00.000Z'),
    })
    await seedPost({
      tenantId: 'posts-app-offer-filter',
      memberId: otherMember.id,
      categoryId: category.id,
      code: 'other-member-offer',
      type: 'offers',
      status: 'published',
      access: 'public',
    })

    const res = await request(app)
      .get(`/posts-app-offer-filter/posts?filter[type]=offers&include=category&filter[member]=${member.id}&filter[expired]=false,true&filter[status]=published,hidden`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.deepStrictEqual(
      res.body.data.map((post: any) => post.attributes.code).sort(),
      ['hidden-expired-offer', 'published-current-offer'],
    )
    assert.ok(includedResource(res.body, 'categories', category.id))
  })

  test('GET /:code/posts supports rich offer list app query', async () => {
    const { admin, category, currencyId, member, memberAccountId } = await postQueryFixture('posts-app-offer-rich')
    await seedPost({
      tenantId: 'posts-app-offer-rich',
      memberId: member.id,
      categoryId: category.id,
      code: 'older-repair-offer',
      title: 'Repair Help',
      description: 'Needle repair support',
      type: 'offers',
      status: 'published',
      access: 'public',
      updated: new Date('2026-01-01T00:00:00.000Z'),
    })
    await seedPost({
      tenantId: 'posts-app-offer-rich',
      memberId: member.id,
      categoryId: category.id,
      code: 'newer-repair-offer',
      title: 'Repair Tools',
      description: 'Needle tool support',
      type: 'offers',
      status: 'published',
      access: 'public',
      updated: new Date('2026-02-01T00:00:00.000Z'),
    })

    const res = await request(app)
      .get('/posts-app-offer-rich/posts?filter[type]=offers&include=category,member,member.group,member.group.currency,member.account&sort=-updated&filter[search]=needle')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.deepStrictEqual(
      res.body.data.map((post: any) => post.attributes.code),
      ['newer-repair-offer', 'older-repair-offer'],
    )
    assert.ok(includedResource(res.body, 'members', member.id))
    assert.ok(includedResource(res.body, 'groups'))
    assert.ok(includedResource(res.body, 'currencies', currencyId))
    assert.ok(includedResource(res.body, 'accounts', memberAccountId))
  })

  test('GET /:code/posts supports offer code lookup app query', async () => {
    const { admin, category, currencyId, member } = await postQueryFixture('posts-app-offer-code')
    await seedPost({
      tenantId: 'posts-app-offer-code',
      memberId: member.id,
      categoryId: category.id,
      code: 'target-offer',
      type: 'offers',
      status: 'published',
      access: 'public',
    })
    await seedPost({
      tenantId: 'posts-app-offer-code',
      memberId: member.id,
      categoryId: category.id,
      code: 'other-offer',
      type: 'offers',
      status: 'published',
      access: 'public',
    })

    const res = await request(app)
      .get('/posts-app-offer-code/posts?filter[type]=offers&filter[code]=target-offer&include=category,member,member.group,member.group.currency')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'target-offer')
    assert.ok(includedResource(res.body, 'categories', category.id))
    assert.ok(includedResource(res.body, 'members', member.id))
    assert.ok(includedResource(res.body, 'currencies', currencyId))
  })

  test('GET /:code/posts supports need member/status/expired/category app query', async () => {
    const { admin, category, member, otherMember } = await postQueryFixture('posts-app-need-filter')
    await seedPost({
      tenantId: 'posts-app-need-filter',
      memberId: member.id,
      categoryId: category.id,
      code: 'published-current-need',
      type: 'needs',
      status: 'published',
      access: 'public',
      expires: new Date('2999-01-01T00:00:00.000Z'),
    })
    await seedPost({
      tenantId: 'posts-app-need-filter',
      memberId: member.id,
      categoryId: category.id,
      code: 'hidden-expired-need',
      type: 'needs',
      status: 'hidden',
      access: 'private',
      expires: new Date('2000-01-01T00:00:00.000Z'),
    })
    await seedPost({
      tenantId: 'posts-app-need-filter',
      memberId: otherMember.id,
      categoryId: category.id,
      code: 'other-member-need',
      type: 'needs',
      status: 'published',
      access: 'public',
    })

    const res = await request(app)
      .get(`/posts-app-need-filter/posts?filter[type]=needs&include=category,member&filter[member]=${member.id}&filter[expired]=false,true&filter[status]=published,hidden`)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.deepStrictEqual(
      res.body.data.map((post: any) => post.attributes.code).sort(),
      ['hidden-expired-need', 'published-current-need'],
    )
    assert.ok(includedResource(res.body, 'categories', category.id))
    const includedMember = includedResource(res.body, 'members', member.id)
    assert.strictEqual(includedMember.attributes.contacts[0].value, 'posts-app-need-filter@example.org')
  })

  test('GET /:code/posts supports need code/account app query', async () => {
    const { admin, category, member, memberAccountId } = await postQueryFixture('posts-app-need-code')
    await seedPost({
      tenantId: 'posts-app-need-code',
      memberId: member.id,
      categoryId: category.id,
      code: 'target-need',
      type: 'needs',
      status: 'published',
      access: 'public',
    })
    await seedPost({
      tenantId: 'posts-app-need-code',
      memberId: member.id,
      categoryId: category.id,
      code: 'other-need',
      type: 'needs',
      status: 'published',
      access: 'public',
    })

    const res = await request(app)
      .get('/posts-app-need-code/posts?filter[type]=needs&filter[code]=target-need&include=category,member,member.account')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'target-need')
    assert.ok(includedResource(res.body, 'categories', category.id))
    assert.ok(includedResource(res.body, 'members', member.id))
    assert.ok(includedResource(res.body, 'accounts', memberAccountId))
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

    await seedPost({ tenantId: 'posts-page', memberId: member.id, code: 'a-hidden', type: 'offers', status: 'draft', access: 'public', created: new Date('2026-05-13') })
    await seedPost({ tenantId: 'posts-page', memberId: member.id, code: 'b-visible', type: 'offers', status: 'published', access: 'public', created: new Date('2026-05-14') })

    const res = await request(app)
      .get('/posts-page/posts?sort=created&page[size]=1')
      .expect(200)

    assert.strictEqual(res.body.data.length, 1)
    assert.strictEqual(res.body.data[0].attributes.code, 'b-visible')
  })

  test('GET /:code/posts supports reverse sorting by update date', async () => {
    await seedGroup({ tenantId: 'posts-sort', status: 'active', access: 'public' })
    const owner = await auth('posts-sort-owner')
    const member = await seedMember({ tenantId: 'posts-sort', status: 'active', userId: owner.id })

    await seedPost({ tenantId: 'posts-sort', memberId: member.id, code: 'third', type: 'offers', status: 'published', access: 'public', created: new Date('2026-05-13'), updated: new Date('2026-05-15') })
    await seedPost({ tenantId: 'posts-sort', memberId: member.id, code: 'first', type: 'offers', status: 'published', access: 'public', created: new Date('2026-05-15'), updated: new Date('2026-05-13') })
    await seedPost({ tenantId: 'posts-sort', memberId: member.id, code: 'second', type: 'offers', status: 'published', access: 'public', created: new Date('2026-05-14'), updated: new Date('2026-05-14') })

    const res = await request(app)
      .get('/posts-sort/posts?sort=-updated')
      .expect(200)

    assert.strictEqual(res.body.data.length, 3)
    assert.strictEqual(res.body.data[0].attributes.code, 'third')
    assert.strictEqual(res.body.data[1].attributes.code, 'second')
    assert.strictEqual(res.body.data[2].attributes.code, 'first')
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

    const events = getNotificationsEvents() as any[]
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].data.attributes.name, 'OfferPublished')
  })

  test('PATCH /:code/posts/:post does not emit duplicate event for already published post edits', async () => {
    await seedGroup({ tenantId: 'posts-no-duplicate-event', status: 'active', access: 'public' })
    const user = await auth('posts-no-duplicate-event-user')
    const member = await seedMember({ tenantId: 'posts-no-duplicate-event', status: 'active', userId: user.id })
    const post = await seedPost({
      tenantId: 'posts-no-duplicate-event',
      memberId: member.id,
      type: 'offers',
      status: 'published',
      title: 'Original title',
    })

    await request(app)
      .patch(`/posts-no-duplicate-event/posts/${post.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        data: {
          type: 'offers',
          attributes: {
            title: 'Updated title',
          },
        },
      })
      .expect(200)

    assert.strictEqual(getNotificationsEvents().length, 0)
  })

  test('POST /:code/posts remains successful when notifications endpoint fails', async () => {
    setNotificationsEventStatus(500)
    await seedGroup({ tenantId: 'posts-notifications-fail', status: 'active', access: 'public' })
    const user = await auth('posts-notifications-fail-user')
    const member = await seedMember({ tenantId: 'posts-notifications-fail', status: 'active', userId: user.id })

    await request(app)
      .post('/posts-notifications-fail/posts')
      .set('Authorization', `Bearer ${user.token}`)
      .send(postInput('offers', {
        title: 'Published despite notification failure',
        description: 'Event delivery fails but write succeeds',
        status: 'published',
      }, member.id))
      .expect(201)

    assert.strictEqual(getNotificationsRequests().length, 1)
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
