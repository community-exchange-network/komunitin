import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from 'jose'
import type { Prisma } from '../src/generated/prisma/client'
import prisma from '../src/utils/prisma'
import { config } from '../src/config'
import { verifySignedToken } from '../src/oidc/token-verifier'
import { getJwks, resetJwksCache } from '../src/oidc/jwks'
import { disconnectPrisma } from '../src/utils/prisma'

type StoredJwk = JWK & Record<string, unknown>

async function createStoredJwk(kid: string): Promise<StoredJwk> {
  const { privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  })

  const jwk = await exportJWK(privateKey)
  return {
    ...jwk,
    kid,
    use: 'sig',
    alg: 'RS256',
  }
}

function toStoredJson(jwk: StoredJwk): Prisma.InputJsonValue {
  return jwk as Prisma.InputJsonValue
}

async function signAccessToken(jwk: StoredJwk) {
  const key = await importJWK(jwk, 'RS256')

  return new SignJWT({ sub: '11111111-1111-1111-1111-111111111111' })
    .setProtectedHeader({ alg: 'RS256', kid: String(jwk.kid) })
    .setIssuer(config.ISSUER_URL)
    .setAudience('app')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

describe('JWKS persistence and rotation', () => {
  beforeEach(async () => {
    resetJwksCache()
    await prisma.signingKey.deleteMany()
  })

  after(async () => {
    await disconnectPrisma()
  })

  test('getJwks generates and persists a signing key without creating jwks.json', async () => {
    const jwksPath = path.resolve(process.cwd(), 'jwks.json')

    const jwks = await getJwks()
    const storedKeys = await prisma.signingKey.findMany()

    assert.strictEqual(fs.existsSync(jwksPath), false)
    assert.strictEqual(jwks.keys.length, 1)
    assert.strictEqual(storedKeys.length, 1)
    assert.strictEqual(storedKeys[0].kid, jwks.keys[0].kid)

    resetJwksCache()
    const reloadedJwks = await getJwks()
    assert.strictEqual(reloadedJwks.keys[0].kid, jwks.keys[0].kid)
  })

  test('rotation keeps the retired key available for token verification overlap', async () => {
    const oldJwk = await createStoredJwk('old-signing-key')
    const oldCreatedAt = new Date(Date.now() - ((config.JWKS_ROTATION_INTERVAL_DAYS + 1) * 24 * 60 * 60 * 1000))

    await prisma.signingKey.create({
      data: {
        kid: String(oldJwk.kid),
        jwk: toStoredJson(oldJwk),
        createdAt: oldCreatedAt,
      },
    })

    const jwks = await getJwks()
    const storedKeys = await prisma.signingKey.findMany({
      orderBy: { createdAt: 'desc' },
    })

    assert.strictEqual(jwks.keys.length, 2)
    assert.notStrictEqual(jwks.keys[0].kid, oldJwk.kid)

    const rotatedKey = storedKeys.find((key) => key.retireAt === null)
    const retiredKey = storedKeys.find((key) => key.kid === oldJwk.kid)

    assert.ok(rotatedKey)
    assert.ok(retiredKey?.retireAt)

    const oldToken = await signAccessToken(oldJwk)
    const newToken = await signAccessToken(jwks.keys[0])

    await assert.doesNotReject(() => verifySignedToken(oldToken, {
      issuer: config.ISSUER_URL,
      audience: 'app',
    }))
    await assert.doesNotReject(() => verifySignedToken(newToken, {
      issuer: config.ISSUER_URL,
      audience: 'app',
    }))
  })
})
