import assert from 'node:assert'
import { describe, it } from 'node:test'
import { signJwt, signServiceJwt } from '../../mocks/auth'
import { createEventBody, setupNotificationsTest } from './utils'

const { app, eventsQueue } = setupNotificationsTest({
  useWorker: true,
})

const ids = {
  user: 'user-1',
  member: 'member-1',
  post: 'post-1',
  transfer: 'transfer-1',
  payer: 'payer-1',
  payee: 'payee-1',
}

const authEvent = () => createEventBody('PasswordResetRequested', {
  code: null,
  user: ids.user,
  data: { user: ids.user, email: 'user@example.org' },
})

const socialEvent = () => createEventBody('MemberJoined', {
  code: 'GRP1',
  user: ids.user,
  data: { member: ids.member },
})

const accountingEvent = () => createEventBody('TransferCommitted', {
  code: 'GRP1',
  user: ids.user,
  data: { transfer: ids.transfer, payer: ids.payer, payee: ids.payee },
})

const post = async (body: object, token: string) => app
  .post('/events')
  .set('Content-Type', 'application/vnd.api+json')
  .set('Authorization', `Bearer ${token}`)
  .send(body)

describe('POST /events', () => {
  describe('authentication', () => {
    it('accepts service publishers with notifications:write', async () => {
      const cases = [
        ['komunitin-auth', authEvent()],
        ['komunitin-social', socialEvent()],
        ['komunitin-accounting', accountingEvent()],
        ['another-service', accountingEvent()],
      ] as const

      for (const [clientId, body] of cases) {
        await post(body, await signServiceJwt(clientId)).then(response => {
          assert.strictEqual(response.status, 201)
          assert.strictEqual(response.body.data.type, 'events')
        })
      }
    })

    it('rejects requests without authentication', async () => {
      await app
        .post('/events')
        .set('Content-Type', 'application/vnd.api+json')
        .send(accountingEvent())
        .expect(400)
    })

    it('rejects an app user token', async () => {
      await post(accountingEvent(), await signJwt(ids.user, ['notifications:write']))
        .then(response => assert.strictEqual(response.status, 403))
    })

    it('rejects a publisher without notifications:write', async () => {
      await post(accountingEvent(), await signServiceJwt('komunitin-accounting', ['accounting:write']))
        .then(response => assert.strictEqual(response.status, 403))
    })

    it('rejects a service token whose subject differs from client_id', async () => {
      await post(accountingEvent(), await signServiceJwt('komunitin-accounting', ['notifications:write'], 'other-subject'))
        .then(response => assert.strictEqual(response.status, 403))
    })
  })

  describe('schema', () => {
    it('accepts every public event variant', async () => {
      const cases = [
        ['komunitin-auth', createEventBody('ValidationEmailRequested', {
          code: 'GRP1',
          user: ids.user,
          data: {
            user: ids.user,
            email: 'user@example.org',
            purpose: 'emailVerification',
            signup: { type: 'member', groupCode: 'GRP1', name: 'Ada', language: 'en' },
          },
        })],
        ['komunitin-auth', authEvent()],
        ['komunitin-social', createEventBody('OfferPublished', {
          code: 'GRP1', user: ids.user, data: { offer: ids.post },
        })],
        ['komunitin-social', createEventBody('NeedPublished', {
          code: 'GRP1', user: ids.user, data: { need: ids.post },
        })],
        ['komunitin-social', createEventBody('MemberRequested', {
          code: 'GRP1', user: ids.user, data: { member: ids.member },
        })],
        ['komunitin-social', socialEvent()],
        ['komunitin-social', createEventBody('GroupRequested', {
          code: 'GRP1', user: ids.user, data: { group: 'GRP1' },
        })],
        ['komunitin-social', createEventBody('GroupActivated', {
          code: 'GRP1', user: ids.user, data: { group: 'GRP1' },
        })],
        ['komunitin-accounting', accountingEvent()],
        ['komunitin-accounting', createEventBody('TransferPending', {
          code: 'GRP1',
          user: ids.user,
          data: { transfer: ids.transfer, payer: ids.payer, payee: ids.payee },
        })],
        ['komunitin-accounting', createEventBody('TransferRejected', {
          code: 'GRP1',
          user: ids.user,
          data: { transfer: ids.transfer, payer: ids.payer, payee: ids.payee },
        })],
      ] as const

      for (const [clientId, body] of cases) {
        await post(body, await signServiceJwt(clientId))
          .then(response => assert.strictEqual(response.status, 201))
      }
    })

    it('accepts publisher-specific payload data without interpreting it', async () => {
      const body = accountingEvent()
      body.data.attributes.data.transfer = '123'

      const response = await post(body, await signServiceJwt('komunitin-accounting'))
      assert.strictEqual(response.status, 201)
      assert.strictEqual(response.body.data.attributes.data.transfer, '123')
    })

    it('rejects a missing group code for non-auth events', async () => {
      const body = socialEvent()
      body.data.attributes.code = null

      const response = await post(body, await signServiceJwt('komunitin-social'))
      assert.strictEqual(response.status, 400)
    })

    it('treats source as opaque metadata', async () => {
      const body = socialEvent()
      body.data.attributes.source = 'legacy-social'

      const response = await post(body, await signServiceJwt('komunitin-social'))
      assert.strictEqual(response.status, 201)
      assert.strictEqual(response.body.data.attributes.source, 'legacy-social')
    })
  })

  it('enqueues the validated event', async () => {
    await post(socialEvent(), await signServiceJwt('komunitin-social'))
      .then(response => assert.strictEqual(response.status, 201))

    assert.strictEqual(eventsQueue.add.mock.callCount(), 1)
    const [jobName, jobData] = eventsQueue.add.mock.calls[0].arguments
    assert.strictEqual(jobName, 'MemberJoined')
    assert.strictEqual(jobData.user, ids.user)
    assert.deepStrictEqual(jobData.data, { member: ids.member })
  })
})
