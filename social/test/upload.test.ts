import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { config } from '../src/config'
import { auth } from './mocks/auth'
import { setS3UploadError } from './mocks/s3'
import { resetDb, seedGroup, seedMember } from './mocks/seed'
import { setupTestServer, teardownTestServer } from './mocks/server'

let app: any
let resetMocks: () => void

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=',
  'base64',
)

before(async () => {
  const server = await setupTestServer()
  app = server.app
  resetMocks = server.resetMocks
})

after(async () => {
  await teardownTestServer()
})

describe('Files upload endpoint', () => {
  beforeEach(async () => {
    resetMocks()
    await resetDb()
  })

  test('POST /:code/files/upload requires JWT', async () => {
    await seedGroup({ tenantId: 'uploads-auth', status: 'active', access: 'public' })

    await request(app)
      .post('/uploads-auth/files/upload')
      .field('resourceType', 'members')
      .attach('file', tinyPng, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(401)
  })

  test('POST /:code/files/upload requires group membership or admin role', async () => {
    await seedGroup({ tenantId: 'uploads-perms', status: 'active', access: 'public' })
    const owner = await auth('uploads-owner')
    await seedMember({ tenantId: 'uploads-perms', userId: owner.id })

    const outsider = await auth('uploads-outsider')

    await request(app)
      .post('/uploads-perms/files/upload')
      .set('Authorization', `Bearer ${outsider.token}`)
      .field('resourceType', 'members')
      .attach('file', tinyPng, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(403)
  })

  test('POST /:code/files/upload uploads a file record with resource type metadata', async () => {
    await seedGroup({ tenantId: 'uploads-success', status: 'active', access: 'public' })
    const user = await auth('uploads-success-user')
    await seedMember({ tenantId: 'uploads-success', userId: user.id })

    const res = await request(app)
      .post('/uploads-success/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'members')
      .attach('file', tinyPng, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201)

    assert.strictEqual(res.body.data.type, 'files')
    assert.strictEqual(res.body.data.attributes.mime, 'image/png')
    assert.strictEqual(res.body.data.attributes.resourceType, 'members')
    assert.strictEqual('resourceId' in res.body.data.attributes, false)
    assert.strictEqual('alt' in res.body.data.attributes, false)
    assert.ok(typeof res.body.data.attributes.url === 'string')
    assert.ok(res.body.data.attributes.url.includes('/uploads-success/members/'))
    assert.ok(res.body.data.attributes.size > 0)
  })

  test('POST /:code/files/upload accepts linked draft members during onboarding', async () => {
    await seedGroup({ tenantId: 'uploads-draft', status: 'active', access: 'public' })
    const user = await auth('uploads-draft-user')
    await seedMember({ tenantId: 'uploads-draft', userId: user.id, status: 'draft' })

    await request(app)
      .post('/uploads-draft/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'members')
      .attach('file', tinyPng, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201)
  })

  test('POST /:code/files/upload rejects missing, legacy, and multiple-file payloads', async () => {
    await seedGroup({ tenantId: 'uploads-fields', status: 'active', access: 'public' })
    const user = await auth('uploads-fields-user')
    await seedMember({ tenantId: 'uploads-fields', userId: user.id })

    await request(app)
      .post('/uploads-fields/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', tinyPng, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(400)

    await request(app)
      .post('/uploads-fields/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'member-image')
      .attach('file', tinyPng, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(400)

    await request(app)
      .post('/uploads-fields/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'members')
      .attach('first', tinyPng, { filename: 'first.png', contentType: 'image/png' })
      .attach('second', tinyPng, { filename: 'second.png', contentType: 'image/png' })
      .expect(400)
  })


  test('POST /:code/files/upload rejects unsupported file types', async () => {
    await seedGroup({ tenantId: 'uploads-mime', status: 'active', access: 'public' })
    const user = await auth('uploads-mime-user')
    await seedMember({ tenantId: 'uploads-mime', userId: user.id })

    const res = await request(app)
      .post('/uploads-mime/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'offers')
      .attach('file', Buffer.from('hello world'), { filename: 'bad.txt', contentType: 'text/plain' })
      .expect(400)

    assert.strictEqual(res.body.errors[0].code, 'BadRequest')
  })

  test('POST /:code/files/upload rejects oversized payloads', async () => {
    await seedGroup({ tenantId: 'uploads-size', status: 'active', access: 'public' })
    const user = await auth('uploads-size-user')
    await seedMember({ tenantId: 'uploads-size', userId: user.id })

    const tooLarge = Buffer.alloc(config.UPLOAD_MAX_BYTES + 1, 1)

    const res = await request(app)
      .post('/uploads-size/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'offers')
      .attach('file', tooLarge, { filename: 'huge.bin', contentType: 'application/octet-stream' })
      .expect(400)

    assert.strictEqual(res.body.errors[0].code, 'BadRequest')
  })

  test('POST /:code/files/upload surfaces S3 failures as controlled errors', async () => {
    await seedGroup({ tenantId: 'uploads-s3-failure', status: 'active', access: 'public' })
    const user = await auth('uploads-s3-failure-user')
    await seedMember({ tenantId: 'uploads-s3-failure', userId: user.id })

    setS3UploadError()

    const res = await request(app)
      .post('/uploads-s3-failure/files/upload')
      .set('Authorization', `Bearer ${user.token}`)
      .field('resourceType', 'groups')
      .attach('file', tinyPng, { filename: 'group.png', contentType: 'image/png' })
      .expect(500)

    assert.strictEqual(res.body.errors[0].code, 'InternalError')
  })
})
