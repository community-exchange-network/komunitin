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
    resetRateLimits()
    fetchCalls.length = 0
  })

  test('GET /health returns 200 with status ok', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200)

    assert.strictEqual(res.body.status, 'ok')
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
    const userId = 'abababab-abab-abab-abab-abababababab'
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
      .type('form')
      .send({ email: 'email-action@example.org' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    const emailedToken = fetchCalls[0].body.data.attributes.data.token
    assert.ok(emailedToken)

    const res = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: 'komunitin-app',
        code: emailedToken,
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
    const userId = '33333333-3333-3333-3333-333333333333'
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
      .type('form')
      .send({ email: 'reset-pwd@example.org' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    const resetCall = fetchCalls[0]
    assert.strictEqual(resetCall.body.data.attributes.name, 'PasswordResetRequested')
    assert.strictEqual(resetCall.body.data.attributes.source, 'auth')
    assert.strictEqual(resetCall.body.data.relationships.user.data.id, userId)
    
    const token = resetCall.body.data.attributes.data.token
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
    const userId = '37373737-3737-3737-3737-373737373737'
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
      .type('form')
      .send({ email: 'stale-reset@example.org' })
      .expect(200)

    const firstToken = fetchCalls[0].body.data.attributes.data.token
    assert.ok(firstToken)

    await request(app)
      .post('/reset-password')
      .type('form')
      .send({ email: 'stale-reset@example.org' })
      .expect(200)

    const secondToken = fetchCalls[1].body.data.attributes.data.token
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
    const userId = '44444444-4444-4444-4444-444444444444'
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
      .send({ email: 'new-email@example.org' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    const emailCall = fetchCalls[0]
    assert.strictEqual(emailCall.body.data.attributes.name, 'ValidationEmailRequested')
    assert.strictEqual(emailCall.body.data.attributes.source, 'auth')
    assert.strictEqual(emailCall.body.data.relationships.user.data.id, userId)
    
    const token = emailCall.body.data.attributes.data.token
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
    const userId = '47474747-4747-4747-4747-474747474747'
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

    const firstToken = fetchCalls[0].body.data.attributes.data.token
    assert.ok(firstToken)

    await request(app)
      .post('/change-email')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'second-change@example.org' })
      .expect(200)

    const secondToken = fetchCalls[1].body.data.attributes.data.token
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
    const userId = '55555555-5555-5555-5555-555555555555'
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
      .type('form')
      .send({ email: 'unverified@example.org' })
      .expect(200)

    assert.strictEqual(fetchCalls.length, 1)
    const emailCall = fetchCalls[0]
    assert.strictEqual(emailCall.body.data.attributes.name, 'ValidationEmailRequested')
    assert.strictEqual(emailCall.body.data.attributes.source, 'auth')
    assert.strictEqual(emailCall.body.data.relationships.user.data.id, userId)
    assert.ok(emailCall.body.data.attributes.data.token)
  })

  test('Initial email verification can be confirmed for the current email', async () => {
    const userId = '66666666-6666-6666-6666-666666666666'
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
      .type('form')
      .send({ email: 'verify-me@example.org' })
      .expect(200)

    const token = fetchCalls[0].body.data.attributes.data.token
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
    const userId = '67676767-6767-6767-6767-676767676767'
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

    const emailToken = fetchCalls[0].body.data.attributes.data.token
    assert.ok(emailToken)

    await request(app)
      .post('/reset-password')
      .type('form')
      .send({ email: 'mixed-actions@example.org' })
      .expect(200)

    const passwordToken = fetchCalls[1].body.data.attributes.data.token
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
          .type('form')
          .send({ email: 'ratelimit@example.org' })
        
        if (res.status === 429) {
          assert.strictEqual(res.body.errors[0].code, 'TooManyRequests')
          return
        }
    }
    assert.fail('Rate limit was not triggered after 105 requests')
  })
})
