import { setupServer } from 'msw/node'
import assert from 'node:assert'
import { after, before, beforeEach, describe, it } from 'node:test'
import supertest from 'supertest'
import { generateKeys, signJwt } from '../../mocks/auth'
import handlers from '../../mocks/handlers'
import { mockTable } from '../../mocks/prisma'
import { _app } from '../../server'
import prisma from '../../utils/prisma'

const server = setupServer(...handlers)

describe('Subscriptions API', () => {
  let subscriptions: any[] = []

  // Helper: build JSON:API request body for subscriptions
  const makeSubscriptionBody = (userId: string, endpoint = 'https://example.com/endpoint/1', meta?: any) => ({
    data: {
      type: 'subscriptions',
      attributes: {
        endpoint,
        keys: { p256dh: 'pkey', auth: 'auth' },
        ...(meta ? { meta } : {})
      },
      relationships: {
        user: { data: { id: userId, type: 'users' } }
      }
    }
  })

  // Helper: create subscription directly via mocked prisma
  const createSubscription = async ({ tenantId = 'GRP1', userId, endpoint = 'https://example.com/default', p256dh = 'p', auth = 'a' }: any) => {
    return await prisma.pushSubscription.create({ data: { tenantId, userId, endpoint, p256dh, auth } })
  }

  const uid = (c: string) => [8,4,4,4,12].map(len => c.repeat(len)).join('-')

  before(async () => {
    await generateKeys()
    server.listen({ onUnhandledRequest: 'bypass' })

    // Simple in-memory mock for pushSubscription table using shared mock helper
    subscriptions = mockTable(prisma.pushSubscription, 'push-subscription')
  })

  after(() => {
    server.close()
  })

  beforeEach(() => {
    subscriptions.length = 0
  })

  it('User can create own subscription', async () => {
    const groupCode = 'GRP1'
    const userId = uid('1')
    const token = await signJwt(userId, ['komunitin_social'])

    const endpoint = 'https://example.com/endpoint/1'
    const body = makeSubscriptionBody(userId, endpoint, { foo: 'bar' })

    const res = await supertest(_app)
      .post(`/${groupCode}/subscriptions`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200)

    assert.equal(res.body.data.attributes.endpoint, endpoint)

    // ensure stored in mocked prisma
    assert.equal(subscriptions.length, 1)
    assert.equal(subscriptions[0].endpoint, endpoint)
    assert.equal(subscriptions[0].userId, userId)
    assert.equal(subscriptions[0].tenantId, groupCode)
  })

  it('Unauthorized access to create subscription is rejected', async () => {
    const groupCode = 'GRP1'
    const endpoint = 'https://example.com/endpoint/unauth'
    const body = makeSubscriptionBody('22222222-2222-2222-2222-222222222222', endpoint)

    await supertest(_app)
      .post(`/${groupCode}/subscriptions`)
      .send(body)
      .expect(400)
  })

  it("User can't create subscription for other user", async () => {
    const groupCode = 'GRP1'
    const userA = uid('3')
    const userB = uid('4')
    const token = await signJwt(userA, ['komunitin_social'])

    const body = makeSubscriptionBody(userB, 'https://example.com/endpoint/forbidden')

    const res = await supertest(_app)
      .post(`/${groupCode}/subscriptions`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(403)

    assert.equal(subscriptions.length, 0)
  })

  it('User can delete own subscription', async () => {
    const groupCode = 'GRP1'
    const userId = uid('5')
    const token = await signJwt(userId, ['komunitin_social'])

    // create subscription directly in the mocked store
    const created = await createSubscription({ tenantId: groupCode, userId, endpoint: 'https://example.com/delete-me' })

    await supertest(_app)
      .delete(`/${groupCode}/subscriptions/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)

    // ensure removed
    assert.equal(subscriptions.find(s => s.id === created.id), undefined)
  })

  it("User can't delete another user's subscription", async () => {
    const groupCode = 'GRP1'
    const owner = uid('6')
    const attacker = uid('7')
    const token = await signJwt(attacker, ['komunitin_social'])

    const created = await createSubscription({ tenantId: groupCode, userId: owner, endpoint: 'https://example.com/delete-other' })

    const res = await supertest(_app)
      .delete(`/${groupCode}/subscriptions/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404)

    // subscription still exists
    assert.ok(subscriptions.find(s => s.id === created.id))
    assert.equal(res.body.errors[0].status, '404')
  })
})
