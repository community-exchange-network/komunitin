import { exportJWK, generateKeyPair, type JWK } from 'jose'
import crypto from 'node:crypto'
import { config } from '../config'
import type { Prisma } from '../generated/prisma/client'
import prisma from '../utils/prisma'
import logger from '../utils/logger'

export type Jwks = {
  keys: StoredJwk[]
}

type StoredJwk = JWK & Record<string, unknown>

const JWKS_ROTATION_INTERVAL_MS = config.JWKS_ROTATION_INTERVAL_DAYS * 24 * 60 * 60 * 1000
const JWKS_RETENTION_MS = config.JWKS_RETENTION_HOURS * 60 * 60 * 1000

let cachedJwksPromise: Promise<Jwks> | undefined

export function resetJwksCache() {
  cachedJwksPromise = undefined
}

function toStoredJson(jwk: StoredJwk): Prisma.InputJsonValue {
  return jwk as Prisma.InputJsonValue
}

async function generateSigningJwk(): Promise<StoredJwk> {
  const { privateKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
    extractable: true,
  })

  const jwk = await exportJWK(privateKey)
  return {
    ...jwk,
    kid: crypto.randomUUID(),
    use: 'sig',
    alg: 'RS256',
  }
}

async function ensureSigningKeys(now: Date) {
  await prisma.signingKey.deleteMany({
    where: {
      retireAt: {
        lte: now,
      },
    },
  })

  const activeKey = await prisma.signingKey.findFirst({
    where: { retireAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (activeKey && now.getTime() - activeKey.createdAt.getTime() < JWKS_ROTATION_INTERVAL_MS) {
    return
  }

  const nextJwk = await generateSigningJwk()
  const nextKid = String(nextJwk.kid)

  if (!activeKey) {
    await prisma.signingKey.create({
      data: {
        kid: nextKid,
        jwk: toStoredJson(nextJwk),
        createdAt: now,
      },
    })
    logger.info({ kid: nextKid }, 'Generated initial JWKS signing key')
    return
  }

  const retireAt = new Date(now.getTime() + JWKS_RETENTION_MS)
  await prisma.$transaction([
    prisma.signingKey.updateMany({
      where: { retireAt: null },
      data: { retireAt },
    }),
    prisma.signingKey.create({
      data: {
        kid: nextKid,
        jwk: toStoredJson(nextJwk),
        createdAt: now,
      },
    }),
  ])

  logger.info({ retiredKid: activeKey.kid, nextKid, retireAt }, 'Rotated JWKS signing key')
}

async function loadJwks(): Promise<Jwks> {
  const now = new Date()
  await ensureSigningKeys(now)

  const signingKeys = await prisma.signingKey.findMany({
    where: {
      OR: [
        { retireAt: null },
        { retireAt: { gt: now } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (signingKeys.length === 0) {
    throw new Error('No signing keys available after JWKS initialization')
  }

  return {
    keys: signingKeys.map(({ jwk }) => jwk as StoredJwk),
  }
}

export async function getJwks(): Promise<Jwks> {
  if (!cachedJwksPromise) {
    cachedJwksPromise = loadJwks().catch((err) => {
      resetJwksCache()
      throw err
    })
  }

  return cachedJwksPromise
}
