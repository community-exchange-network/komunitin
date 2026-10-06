import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'
import { decodeProtectedHeader } from 'jose'
import { app, initializeApp } from '../src/app'
import prisma, { disconnectPrisma } from '../src/utils/prisma'
import { config } from '../src/config'
import { resetJwksCache } from '../src/oidc/jwks'
import { refreshOidcProvider } from '../src/oidc/provider-runtime'

async function resetAuthState() {
  resetJwksCache()
  await prisma.oidcPayload.deleteMany()
  await prisma.userActionToken.deleteMany()
  await prisma.user.deleteMany()
  await prisma.signingKey.deleteMany()
}

async function reloadWithFreshInitialKey() {
  await refreshOidcProvider()
  const res = await request(app)
    .get('/.well-known/jwks.json')
    .expect(200)

  assert.strictEqual(res.body.keys.length, 1)
  return String(res.body.keys[0].kid)
}

describe('OIDC provider JWKS hot reload', () => {
  before(async () => {
    await initializeApp()
  })

  beforeEach(async () => {
    await resetAuthState()
  })

  after(async () => {
    await disconnectPrisma()
  })

  test('discovery advertises the well-known JWKS endpoint', async () => {
    const response = await request(app)
      .get('/.well-known/openid-configuration')
      .expect(200)

    assert.strictEqual(new URL(response.body.jwks_uri).pathname, '/.well-known/jwks.json')
  })

  test('reload rotates keys and signs new tokens with the new first key', async () => {
    const oldKid = await reloadWithFreshInitialKey()
    const oldCreatedAt = new Date(Date.now() - ((config.JWKS_ROTATION_INTERVAL_DAYS + 1) * 24 * 60 * 60 * 1000))

    await prisma.signingKey.update({
      where: { kid: oldKid },
      data: { createdAt: oldCreatedAt },
    })

    const reloaded = await refreshOidcProvider()
    assert.strictEqual(reloaded, true)

    const jwksRes = await request(app)
      .get('/.well-known/jwks.json')
      .expect(200)
    const keyIds = jwksRes.body.keys.map((key: { kid: string }) => key.kid)

    assert.strictEqual(keyIds.length, 2)
    assert.notStrictEqual(keyIds[0], oldKid)
    assert.strictEqual(keyIds[1], oldKid)

    const tokenRes = await request(app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'client_credentials',
        client_id: 'komunitin-notifications',
        client_secret: 'replace-this-with-a-secure-password',
        scope: 'email',
      })
      .expect(200)

    const header = decodeProtectedHeader(tokenRes.body.access_token)
    assert.strictEqual(header.kid, keyIds[0])
  })

  test('reload removes expired retired keys from the published JWKS', async () => {
    const oldKid = await reloadWithFreshInitialKey()
    const oldCreatedAt = new Date(Date.now() - ((config.JWKS_ROTATION_INTERVAL_DAYS + 1) * 24 * 60 * 60 * 1000))

    await prisma.signingKey.update({
      where: { kid: oldKid },
      data: { createdAt: oldCreatedAt },
    })
    await refreshOidcProvider()

    await prisma.signingKey.update({
      where: { kid: oldKid },
      data: { retireAt: new Date(Date.now() - 60 * 1000) },
    })

    const reloaded = await refreshOidcProvider()
    assert.strictEqual(reloaded, true)

    const jwksRes = await request(app)
      .get('/.well-known/jwks.json')
      .expect(200)
    const keyIds = jwksRes.body.keys.map((key: { kid: string }) => key.kid)

    assert.strictEqual(keyIds.length, 1)
    assert.ok(!keyIds.includes(oldKid))
  })
})
