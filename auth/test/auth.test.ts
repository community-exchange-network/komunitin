import { after, before, beforeEach, describe, test, mock } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { decodeJwt } from 'jose'
import { setupTestServer, teardownTestServer, resetDb } from './helper'
import prisma from '../src/utils/prisma'
import { hashPassword } from '../src/services/tokens'
import { resetRateLimits } from '../src/utils/rate-limit'
import type { Express } from 'express'

// Mock global fetch to intercept emails
const fetchCalls: { url: string; init: any; body: any }[] = []
const originalFetch = global.fetch
let app: Express

async function requestActionToken({
  userId,
  purpose,
  email,
}: {
  userId: string
  purpose: string
  email?: string
}) {
  const authRes = await request(app)
    .post('/token')
    .type('form')
    .send({
      grant_type: 'client_credentials',
      client_id: 'komunitin-notifications',
      client_secret: 'replace-this-with-a-secure-password',
      scope: 'email',
    })
    .expect(200)

  const body = {
    userId,
    purpose,
    ...(email ? { email } : {}),
  }

  const tokenRes = await request(app)
    .post('/action-token')
    .set('Authorization', `Bearer ${authRes.body.access_token}`)
    .type('json')
    .send(body)
    .expect(200)

  return tokenRes.body as { token: string; email: string }
}

before(() => {
  global.fetch = async (url: any, init: any) => {
    let body = null
    if (init && init.body) {
      body = JSON.parse(init.body)
    }
    fetchCalls.push({ url: String(url), init, body })
    return {
      ok: true,
      status: 201,
      json: async () => ({ data: { type: 'events', id: 'job-123' } }),
      text: async () => 'ok',
    } as any
  }
})

after(() => {
  global.fetch = originalFetch
})

before(async () => {
  ;({ app } = await setupTestServer())
})

after(async () => {
  await teardownTestServer()
})

describe('Auth Service Integration Tests', () => {
  beforeEach(async () => {
    await resetDb()
    fetchCalls.length = 0
  })

  test('GET /health returns 200 with status ok', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200)

    assert.strictEqual(res.body.status, 'ok')
  })

  test('POST /register creates an unverified user and sends validation email', async () => {
    const registerRes = await request(app)
      .post('/register')
      .type('json')
      .send({
        email: '  New.User@Example.ORG  ',
        password: 'password123',
      })
      .expect(201)

    assert.ok(registerRes.body.id)
    assert.strictEqual(registerRes.body.email, 'new.user@example.org')
    assert.strictEqual(registerRes.body.emailVerified, false)

    const user = await prisma.user.findUnique({
      where: { id: registerRes.body.id },
    })
    assert.ok(user)
    assert.strictEqual(user.email, 'new.user@example.org')
    assert.strictEqual(user.emailVerified, false)
    assert.strictEqual(user.status, 'active')
    assert.notStrictEqual(user.passwordHash, 'password123')

    assert.strictEqual(fetchCalls.length, 1)
    const emailCall = fetchCalls[0]
    assert.strictEqual(emailCall.body.data.attributes.name, 'ValidationEmailRequested')
    assert.strictEqual(emailCall.body.data.attributes.source, 'auth')
    assert.strictEqual(emailCall.body.data.relationships.user.data.id, user.id)
    assert.deepStrictEqual(emailCall.body.data.attributes.data, { user: user.id, email: 'new.user@example.org' })
    assert.strictEqual(emailCall.body.data.attributes.data.token, undefined)

    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: '  NEW.USER@Example.ORG  ',
        password: 'password123',
        scope: 'email',
      })
      .expect(200)

    const decoded = decodeJwt(tokenRes.body.access_token) as any
    assert.strictEqual(decoded.sub, user.id)
    assert.strictEqual(decoded.email, 'new.user@example.org')
    assert.strictEqual(decoded.email_verified, false)

    const { token } = await requestActionToken({ userId: user.id, purpose: 'emailVerification' })
    await request(app)
      .post('/change-email/confirm')
      .send({ token })
      .expect(200)

    const verifiedUser = await prisma.user.findUnique({ where: { id: user.id } })
    assert.ok(verifiedUser)
    assert.strictEqual(verifiedUser.emailVerified, true)
  })

  test('POST /register rejects duplicate emails', async () => {
    await request(app)
      .post('/register')
      .set('X-Forwarded-For', '203.0.113.10')
      .type('json')
      .send({
        email: 'duplicate@example.org',
        password: 'password123',
      })
      .expect(201)

    const duplicateRes = await request(app)
      .post('/register')
      .set('X-Forwarded-For', '203.0.113.11')
      .type('json')
      .send({
        email: '  DUPLICATE@example.org  ',
        password: 'another-password',
      })
      .expect(409)

    assert.strictEqual(duplicateRes.body.errors[0].code, 'Conflict')
    assert.strictEqual(fetchCalls.length, 1)
  })

  test('POST /register handles concurrent duplicate registrations', async () => {
    const responses = await Promise.all([
      request(app)
        .post('/register')
        .set('X-Forwarded-For', '203.0.113.20')
        .type('json')
        .send({
          email: 'race@example.org',
          password: 'password123',
        }),
      request(app)
        .post('/register')
        .set('X-Forwarded-For', '203.0.113.21')
        .type('json')
        .send({
          email: 'race@example.org',
          password: 'password456',
        }),
    ])

    const statuses = responses.map(response => response.status).sort()
    assert.deepStrictEqual(statuses, [201, 409])

    const users = await prisma.user.findMany({
      where: { email: 'race@example.org' },
    })
    assert.strictEqual(users.length, 1)
  })

  test('POST /register validates email and password', async () => {
    const invalidEmailRes = await request(app)
      .post('/register')
      .set('X-Forwarded-For', '203.0.113.30')
      .type('json')
      .send({
        email: 'not-an-email',
        password: 'password123',
      })
      .expect(400)

    assert.strictEqual(invalidEmailRes.body.errors[0].code, 'BadRequest')

    const shortPasswordRes = await request(app)
      .post('/register')
      .set('X-Forwarded-For', '203.0.113.31')
      .type('json')
      .send({
        email: 'short-password@example.org',
        password: 'short',
      })
      .expect(400)

    assert.strictEqual(shortPasswordRes.body.errors[0].code, 'BadRequest')
    assert.strictEqual(fetchCalls.length, 0)
  })

  test('POST /token with ROPC (password grant)', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'test@example.org',
        passwordHash,
        emailVerified: false,
        status: 'active',
      },
    })

    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'test@example.org',
        password: 'password123',
        scope: 'email social:read offline_access',
      })
      .expect(200)

    assert.ok(res.body.access_token)
    assert.ok(res.body.refresh_token)
    assert.strictEqual(res.body.token_type, 'Bearer')

    const decoded = decodeJwt(res.body.access_token) as any
    assert.strictEqual(decoded.sub, userId)
    assert.strictEqual(decoded.email, 'test@example.org')
    assert.strictEqual(decoded.email_verified, false)
    assert.strictEqual(decoded.scope, 'email social:read offline_access')
  })

  test('POST /token with refresh_token returns app JWTs with API scopes', async () => {
    const userId = '12121212-1212-1212-1212-121212121212'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'refresh@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const loginRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'refresh@example.org',
        password: 'password123',
        scope: 'email offline_access social:read',
      })
      .expect(200)

    const refreshRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        client_id: 'komunitin-app',
        refresh_token: loginRes.body.refresh_token,
      })
      .expect(200)

    assert.ok(refreshRes.body.access_token)
    assert.ok(refreshRes.body.refresh_token)
    assert.strictEqual(refreshRes.body.scope, 'social:read')

    const decoded = decodeJwt(refreshRes.body.access_token) as any
    assert.strictEqual(decoded.sub, userId)
    assert.strictEqual(decoded.aud, 'app')
    assert.strictEqual(decoded.scope, 'social:read')
  })

  test('POST /token does not redeem emailed action tokens through authorization_code', async () => {
    const userId = 'abababab-abab-4bab-abab-abababababab'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'email-action@example.org',
        passwordHash,
        emailVerified: false,
        status: 'active',
      },
    })

    await request(app)
      .post('/reset-password')
      .type('json')
      .send({ email: 'email-action@example.org' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    assert.deepStrictEqual(fetchCalls[0].body.data.attributes.data, { user: userId, email: 'email-action@example.org' })
    assert.strictEqual(fetchCalls[0].body.data.attributes.data.token, undefined)
    const { token: actionToken } = await requestActionToken({ userId, purpose: 'passwordReset' })

    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: 'komunitin-app',
        code: actionToken,
      })
      .expect(400)

    assert.strictEqual(res.body.error, 'invalid_request')
    assert.strictEqual(res.body.error_description, 'requested grant type is not allowed for this client')
  })

  test('POST /token with Client Credentials', async () => {
    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        scope: 'social:read accounting:read',
      })
      .expect(200)

    assert.ok(res.body.access_token)
    assert.strictEqual(res.body.token_type, 'Bearer')
    assert.strictEqual(res.body.scope, 'social:read accounting:read')

    const decoded = decodeJwt(res.body.access_token) as any
    assert.strictEqual(decoded.client_id, 'komunitin-notifications')
    assert.strictEqual(decoded.scope, 'social:read accounting:read')
  })

  test('POST /token with Client Credentials rejects scopes outside the client allowlist', async () => {
    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        scope: 'social:write',
      })
      .expect(400)

    assert.strictEqual(res.body.error, 'invalid_scope')
  })

  test('Client credentials tokens cannot call user endpoints', async () => {
    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        scope: 'social:read',
      })
      .expect(200)

    const res = await request(app)
      .post('/change-email')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`)
      .send({ email: 'm2m-should-not-pass@example.org' })
      .expect(401)

    assert.strictEqual(res.body.errors[0].code, 'Unauthorized')
  })

  test('POST /action-token rejects non-notifications clients', async () => {
    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        scope: 'accounting:read',
      })
      .expect(200)

    const res = await request(app)
      .post('/action-token')
      .set('Authorization', `Bearer ${tokenRes.body.access_token}`)
      .send({
        userId: '11111111-1111-1111-1111-111111111111',
        purpose: 'passwordReset',
      })
      .expect(401)

    assert.strictEqual(res.body.errors[0].code, 'Unauthorized')
  })

  test('POST /action-token creates purpose-bound unsubscribe tokens', async () => {
    const userId = '25252525-2525-4525-8525-252525252525'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'unsubscribe-token@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const actionToken = await requestActionToken({ userId, purpose: 'unsubscribe' })

    assert.ok(actionToken.token)
    assert.strictEqual(actionToken.email, 'unsubscribe-token@example.org')

    const storedToken = await prisma.userActionToken.findFirst({
      where: {
        userId,
        purpose: 'unsubscribe',
        usedAt: null,
      },
    })
    assert.ok(storedToken)
  })

  test('POST /action-token rejects invalid JSON bodies', async () => {
    const authRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        scope: 'email',
      })
      .expect(200)

    const res = await request(app)
      .post('/action-token')
      .set('Authorization', `Bearer ${authRes.body.access_token}`)
      .type('json')
      .send({
        userId: 'not-a-uuid',
        purpose: 'not-a-purpose',
      })
      .expect(400)

    assert.strictEqual(res.body.errors[0].code, 'BadRequest')
  })

  test('POST /action-token requires email for email change tokens', async () => {
    const userId = '28282828-2828-4828-8828-282828282828'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'missing-email-change@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const authRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        scope: 'email',
      })
      .expect(200)

    const res = await request(app)
      .post('/action-token')
      .set('Authorization', `Bearer ${authRes.body.access_token}`)
      .type('json')
      .send({
        userId,
        purpose: 'emailChange',
      })
      .expect(400)

    assert.strictEqual(res.body.errors[0].code, 'BadRequest')
  })

  test('POST /redeem-action-token consumes unsubscribe tokens for the social client', async () => {
    const userId = '31313131-3131-4131-8131-313131313131'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'redeem-unsubscribe@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const { token } = await requestActionToken({ userId, purpose: 'unsubscribe' })

    const socialTokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        scope: 'accounting:read',
      })
      .expect(200)

    const res = await request(app)
      .post('/redeem-action-token')
      .set('Authorization', `Bearer ${socialTokenRes.body.access_token}`)
      .type('json')
      .send({ token, purpose: 'unsubscribe' })
      .expect(200)

    assert.strictEqual(res.body.userId, userId)
    assert.strictEqual(res.body.email, 'redeem-unsubscribe@example.org')
    assert.strictEqual(res.body.purpose, 'unsubscribe')

    // Single-use: a second redemption of the same token fails.
    const secondRes = await request(app)
      .post('/redeem-action-token')
      .set('Authorization', `Bearer ${socialTokenRes.body.access_token}`)
      .type('json')
      .send({ token, purpose: 'unsubscribe' })
      .expect(400)

    assert.strictEqual(secondRes.body.errors[0].code, 'BadRequest')
  })

  test('POST /redeem-action-token rejects non-social clients', async () => {
    const authRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        scope: 'email',
      })
      .expect(200)

    const res = await request(app)
      .post('/redeem-action-token')
      .set('Authorization', `Bearer ${authRes.body.access_token}`)
      .type('json')
      .send({ token: 'some-token', purpose: 'unsubscribe' })
      .expect(401)

    assert.strictEqual(res.body.errors[0].code, 'Unauthorized')
  })

  test('POST /redeem-action-token refuses purposes other than unsubscribe', async () => {
    const userId = '32323232-3232-4232-8232-323232323232'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'redeem-reset@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const { token } = await requestActionToken({ userId, purpose: 'passwordReset' })

    const socialTokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        scope: 'accounting:read',
      })
      .expect(200)

    const res = await request(app)
      .post('/redeem-action-token')
      .set('Authorization', `Bearer ${socialTokenRes.body.access_token}`)
      .type('json')
      .send({ token, purpose: 'passwordReset' })
      .expect(400)

    assert.strictEqual(res.body.errors[0].code, 'BadRequest')
  })

  test('Token-exchanged user tokens cannot call app user endpoints', async () => {
    const userId = '24242424-2424-2424-2424-242424242424'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'service-exchanged@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const userTokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'service-exchanged@example.org',
        password: 'password123',
        scope: 'accounting:read',
      })
      .expect(200)

    const exchangeRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        subject_token: userTokenRes.body.access_token,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'accounting:read',
      })
      .expect(200)

    const res = await request(app)
      .post('/change-email')
      .set('Authorization', `Bearer ${exchangeRes.body.access_token}`)
      .send({ email: 'service-exchanged-new@example.org' })
      .expect(401)

    assert.strictEqual(res.body.errors[0].code, 'Unauthorized')
  })

  test('POST /token with Token Exchange', async () => {
    // 1. Seed user and generate user access token
    const userId = '22222222-2222-2222-2222-222222222222'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'user-exchange@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'user-exchange@example.org',
        password: 'password123',
        scope: 'email accounting:read accounting:write',
      })
      .expect(200)

    const subjectToken = tokenRes.body.access_token

    // 2. Perform token exchange from social client for downstream accounting access.
    const exchangeRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        subject_token: subjectToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'accounting:read',
      })
      .expect(200)

    assert.ok(exchangeRes.body.access_token)
    
    const decoded = decodeJwt(exchangeRes.body.access_token) as any
    assert.strictEqual(decoded.sub, userId)
    assert.strictEqual(decoded.email, undefined)
    assert.strictEqual(decoded.client_id, 'komunitin-social')
    assert.strictEqual(decoded.scope, 'accounting:read')
  })

  test('POST /token with Token Exchange does not escalate scopes', async () => {
    const userId = '26262626-2626-2626-2626-262626262626'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'limited@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'limited@example.org',
        password: 'password123',
        scope: 'accounting:read',
      })
      .expect(200)

    const exchangeRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        subject_token: tokenRes.body.access_token,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'accounting:read accounting:write',
      })
      .expect(200)

    const decoded = decodeJwt(exchangeRes.body.access_token) as any
    assert.strictEqual(decoded.scope, 'accounting:read')
    assert.strictEqual(decoded.email, undefined)
  })

  test('POST /token with Token Exchange rejects scopes outside the client allowlist', async () => {
    const userId = '27272727-2727-2727-2727-272727272727'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'cross-service@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'cross-service@example.org',
        password: 'password123',
        scope: 'social:read',
      })
      .expect(200)

    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        subject_token: tokenRes.body.access_token,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'social:read',
      })
      .expect(400)

    assert.strictEqual(res.body.error, 'invalid_scope')
  })

  test('POST /token with Token Exchange rejects machine subject tokens', async () => {
    const clientTokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-social',
        client_secret: 'komunitin-social-secret',
        scope: 'accounting:read',
      })
      .expect(200)

    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        subject_token: clientTokenRes.body.access_token,
        subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
        scope: 'accounting:read',
      })
      .expect(400)

    assert.strictEqual(res.body.error, 'invalid_grant')
  })

  test('Password Reset and Change Flow', async () => {
    const userId = '33333333-3333-4333-8333-333333333333'
    const passwordHash = await hashPassword('old-password')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'reset-pwd@example.org',
        passwordHash,
        status: 'active',
      },
    })

    // 1. Request Reset
    await request(app)
      .post('/reset-password')
      .type('json')
      .send({ email: '  RESET-PWD@Example.ORG  ' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    const resetCall = fetchCalls[0]
    assert.strictEqual(resetCall.body.data.attributes.name, 'PasswordResetRequested')
    assert.strictEqual(resetCall.body.data.attributes.source, 'auth')
    assert.strictEqual(resetCall.body.data.relationships.user.data.id, userId)
    assert.deepStrictEqual(resetCall.body.data.attributes.data, { user: userId, email: 'reset-pwd@example.org' })
    assert.strictEqual(resetCall.body.data.attributes.data.token, undefined)
    
    const { token } = await requestActionToken({ userId, purpose: 'passwordReset' })
    assert.ok(token)

    // 2. Confirm Change
    await request(app)
      .post('/change-password')
      .send({ token, password: 'new-secure-password' })
      .expect(200)

    // 3. Verify Login with new password
    await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'reset-pwd@example.org',
        password: 'new-secure-password',
      })
      .expect(200)

    await request(app)
      .post('/change-password')
      .send({ token, password: 'another-password' })
      .expect(400)
  })

  test('Older password reset tokens are invalidated when a new reset is requested', async () => {
    const userId = '37373737-3737-4373-8373-373737373737'
    const passwordHash = await hashPassword('old-password')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'stale-reset@example.org',
        passwordHash,
        status: 'active',
      },
    })

    await request(app)
      .post('/reset-password')
      .type('json')
      .send({ email: 'stale-reset@example.org' })
      .expect(200)

    assert.deepStrictEqual(fetchCalls[0].body.data.attributes.data, { user: userId, email: 'stale-reset@example.org' })
    assert.strictEqual(fetchCalls[0].body.data.attributes.data.token, undefined)
    const { token: firstToken } = await requestActionToken({ userId, purpose: 'passwordReset' })
    assert.ok(firstToken)

    await request(app)
      .post('/reset-password')
      .type('json')
      .send({ email: 'stale-reset@example.org' })
      .expect(200)

    assert.deepStrictEqual(fetchCalls[1].body.data.attributes.data, { user: userId, email: 'stale-reset@example.org' })
    assert.strictEqual(fetchCalls[1].body.data.attributes.data.token, undefined)
    const { token: secondToken } = await requestActionToken({ userId, purpose: 'passwordReset' })
    assert.ok(secondToken)
    assert.notStrictEqual(firstToken, secondToken)

    const staleResetRes = await request(app)
      .post('/change-password')
      .send({ token: firstToken, password: 'attacker-password' })
      .expect(400)

    assert.strictEqual(staleResetRes.body.errors[0].detail, 'Invalid or expired reset token')

    await request(app)
      .post('/change-password')
      .send({ token: secondToken, password: 'new-valid-password' })
      .expect(200)

    await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'stale-reset@example.org',
        password: 'new-valid-password',
      })
      .expect(200)
  })

  test('Email Change Flow', async () => {
    const userId = '44444444-4444-4444-8444-444444444444'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'old-email@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    // 1. Get access token
    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'old-email@example.org',
        password: 'password123',
      })
      .expect(200)

    const accessToken = tokenRes.body.access_token

    // 2. Request Email Change
    await request(app)
      .post('/change-email')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: '  New-Email@Example.ORG  ' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    const emailCall = fetchCalls[0]
    assert.strictEqual(emailCall.body.data.attributes.name, 'ValidationEmailRequested')
    assert.strictEqual(emailCall.body.data.attributes.source, 'auth')
    assert.strictEqual(emailCall.body.data.relationships.user.data.id, userId)
    assert.deepStrictEqual(emailCall.body.data.attributes.data, { user: userId, email: 'new-email@example.org' })
    assert.strictEqual(emailCall.body.data.attributes.data.token, undefined)
    
    const actionToken = await requestActionToken({ userId, purpose: 'emailChange', email: '  New-Email@Example.ORG  ' })
    assert.strictEqual(actionToken.email, 'new-email@example.org')
    const token = actionToken.token
    assert.ok(token)

    // 3. Confirm Change
    await request(app)
      .post('/change-email/confirm')
      .send({ token })
      .expect(200)

    // 4. Verify user in database is updated
    const user = await prisma.user.findUnique({ where: { id: userId } })
    assert.ok(user)
    assert.strictEqual(user.email, 'new-email@example.org')
    assert.strictEqual(user.emailVerified, true)
  })

  test('Older email change tokens are invalidated when a new change is requested', async () => {
    const userId = '47474747-4747-4747-8747-474747474747'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'email-change@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'email-change@example.org',
        password: 'password123',
      })
      .expect(200)

    const accessToken = tokenRes.body.access_token

    await request(app)
      .post('/change-email')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'first-change@example.org' })
      .expect(200)

    assert.deepStrictEqual(fetchCalls[0].body.data.attributes.data, { user: userId, email: 'first-change@example.org' })
    assert.strictEqual(fetchCalls[0].body.data.attributes.data.token, undefined)
    const firstActionToken = await requestActionToken({ userId, purpose: 'emailChange', email: 'first-change@example.org' })
    assert.strictEqual(firstActionToken.email, 'first-change@example.org')
    const firstToken = firstActionToken.token
    assert.ok(firstToken)

    await request(app)
      .post('/change-email')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'second-change@example.org' })
      .expect(200)

    assert.deepStrictEqual(fetchCalls[1].body.data.attributes.data, { user: userId, email: 'second-change@example.org' })
    assert.strictEqual(fetchCalls[1].body.data.attributes.data.token, undefined)
    const secondActionToken = await requestActionToken({ userId, purpose: 'emailChange', email: 'second-change@example.org' })
    assert.strictEqual(secondActionToken.email, 'second-change@example.org')
    const secondToken = secondActionToken.token
    assert.ok(secondToken)
    assert.notStrictEqual(firstToken, secondToken)

    const staleConfirmRes = await request(app)
      .post('/change-email/confirm')
      .send({ token: firstToken })
      .expect(400)

    assert.strictEqual(staleConfirmRes.body.errors[0].detail, 'Invalid or expired token')

    await request(app)
      .post('/change-email/confirm')
      .send({ token: secondToken })
      .expect(200)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    assert.ok(user)
    assert.strictEqual(user.email, 'second-change@example.org')
    assert.strictEqual(user.emailVerified, true)
  })

  test('Resend Validation Flow', async () => {
    const userId = '55555555-5555-4555-8555-555555555555'
    await prisma.user.create({
      data: {
        id: userId,
        email: 'unverified@example.org',
        passwordHash: 'dummy',
        emailVerified: false,
        status: 'active',
      },
    })

    // Request resend validation
    await request(app)
      .post('/resend-validation')
      .type('json')
      .send({ email: 'unverified@example.org' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    const emailCall = fetchCalls[0]
    assert.strictEqual(emailCall.body.data.attributes.name, 'ValidationEmailRequested')
    assert.strictEqual(emailCall.body.data.attributes.source, 'auth')
    assert.strictEqual(emailCall.body.data.relationships.user.data.id, userId)
    assert.deepStrictEqual(emailCall.body.data.attributes.data, { user: userId, email: 'unverified@example.org' })
    assert.strictEqual(emailCall.body.data.attributes.data.token, undefined)
    const { token } = await requestActionToken({ userId, purpose: 'emailVerification' })
    assert.ok(token)
  })

  test('Initial email verification can be confirmed for the current email', async () => {
    const userId = '66666666-6666-4666-8666-666666666666'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'verify-me@example.org',
        passwordHash,
        emailVerified: false,
        status: 'active',
      },
    })

    await request(app)
      .post('/resend-validation')
      .type('json')
      .send({ email: 'verify-me@example.org' })
      .expect(200)

    assert.deepStrictEqual(fetchCalls[0].body.data.attributes.data, { user: userId, email: 'verify-me@example.org' })
    assert.strictEqual(fetchCalls[0].body.data.attributes.data.token, undefined)
    const { token } = await requestActionToken({ userId, purpose: 'emailVerification' })
    assert.ok(token)

    await request(app)
      .post('/change-email/confirm')
      .send({ token })
      .expect(200)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    assert.ok(user)
    assert.strictEqual(user.email, 'verify-me@example.org')
    assert.strictEqual(user.emailVerified, true)
  })

  test('Password reset and email action tokens do not invalidate each other', async () => {
    const userId = '67676767-6767-4676-8676-676767676767'
    const passwordHash = await hashPassword('password123')
    await prisma.user.create({
      data: {
        id: userId,
        email: 'mixed-actions@example.org',
        passwordHash,
        emailVerified: true,
        status: 'active',
      },
    })

    const loginRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'mixed-actions@example.org',
        password: 'password123',
      })
      .expect(200)

    await request(app)
      .post('/change-email')
      .set('Authorization', `Bearer ${loginRes.body.access_token}`)
      .send({ email: 'mixed-actions-new@example.org' })
      .expect(200)

    assert.deepStrictEqual(fetchCalls[0].body.data.attributes.data, { user: userId, email: 'mixed-actions-new@example.org' })
    assert.strictEqual(fetchCalls[0].body.data.attributes.data.token, undefined)
    const emailActionToken = await requestActionToken({ userId, purpose: 'emailChange', email: 'mixed-actions-new@example.org' })
    assert.strictEqual(emailActionToken.email, 'mixed-actions-new@example.org')
    const emailToken = emailActionToken.token
    assert.ok(emailToken)

    await request(app)
      .post('/reset-password')
      .type('json')
      .send({ email: 'mixed-actions@example.org' })
      .expect(200)

    assert.deepStrictEqual(fetchCalls[1].body.data.attributes.data, { user: userId, email: 'mixed-actions@example.org' })
    assert.strictEqual(fetchCalls[1].body.data.attributes.data.token, undefined)
    const { token: passwordToken } = await requestActionToken({ userId, purpose: 'passwordReset' })
    assert.ok(passwordToken)

    await request(app)
      .post('/change-email/confirm')
      .send({ token: emailToken })
      .expect(200)

    await request(app)
      .post('/change-password')
      .send({ token: passwordToken, password: 'new-password123' })
      .expect(200)

    await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'mixed-actions-new@example.org',
        password: 'new-password123',
      })
      .expect(200)
  })

  test('POST /token with ROPC fails on invalid credentials', async () => {
    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'password',
        client_id: 'komunitin-app',
        username: 'nonexistent@example.org',
        password: 'wrongpassword',
      })
      .expect(400)

    assert.strictEqual(res.body.error, 'invalid_grant')
  })

  test('POST /token fails with unknown client', async () => {
    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'unknown-client',
        client_secret: 'does-not-matter',
      })
      .expect(401) // oidc-provider normally returns 401 for invalid client Auth
  })

  test('Middleware rejects missing authorization header', async () => {
    const res = await request(app)
      .post('/change-email')
      .send({ email: 'should-fail@example.org' })
      .expect(401)
    
    assert.strictEqual(res.body.errors[0].code, 'Unauthorized')
  })

  test('Internal errors do not leak implementation details', async () => {
    const express = (await import('express')).default
    const { errorHandler } = await import('../src/server/errors')
    const testApp = express()
    testApp.get('/test-500', (req: any, res: any, next: any) => next(new Error('secret implementation detail')))
    testApp.use(errorHandler)
    
    const res = await request(testApp)
      .get('/test-500')
      .expect(500)

    assert.strictEqual(res.body.errors[0].code, 'InternalError')
    assert.strictEqual(res.body.errors[0].detail, 'Internal Error')
    assert.strictEqual(res.body.errors.length, 1)
  })

  test('Middleware rejects invalid token', async () => {
    const res = await request(app)
      .post('/change-email')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ email: 'should-fail@example.org' })
      .expect(401)
    
    assert.strictEqual(res.body.errors[0].code, 'Unauthorized')
  })

  test('Rate limiting triggers on too many requests', async () => {
    // RATE_LIMIT_MAX_ATTEMPTS is 100 by default
    for (let i = 0; i < 105; i++) {
        const res = await request(app)
          .post('/reset-password')
          .type('json')
          .send({ email: 'ratelimit@example.org' })
        
        if (res.status === 429) {
          assert.strictEqual(res.body.errors[0].code, 'TooManyRequests')
          return
        }
    }
    assert.fail('Rate limit was not triggered after 105 requests')
  })
})
