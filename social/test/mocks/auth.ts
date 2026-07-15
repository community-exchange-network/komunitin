import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { config } from '../../src/config'
import { Scope } from '../../src/server/scopes'
import { toUuid } from './utils'
import { seedUser } from './seed'

let privateKey: any
let jwks: any

export const generateKeys = async () => {
  const keys = await generateKeyPair('RS256', {
    modulusLength: 2048,
  })
  privateKey = keys.privateKey
  const publicJwk = await exportJWK(keys.publicKey)
  publicJwk.kid = 'test-key-id'
  publicJwk.alg = 'RS256'
  publicJwk.use = 'sig'

  jwks = {
    keys: [publicJwk]
  }
}

export const getJwks = () => {
  return jwks
}

export const signJwt = async (
  userId: string,
  email = 'user@example.org',
  scope?: string | string[],
  options: {
    audience?: string
    includeDefaultScopes?: boolean
    issuer?: string
  } = {},
) => {
  const requestedScopes = scope === undefined ? [] : Array.isArray(scope) ? scope : [scope]
  const scopes = [
    ...(options.includeDefaultScopes === false ? [] : [
      Scope.SocialRead,
      Scope.SocialWrite,
      Scope.AccountingRead,
      Scope.AccountingWrite,
    ]),
    ...requestedScopes,
  ]
  const payload: Record<string, unknown> = {
    client_id: 'komunitin-app',
    email,
    ...(scopes.length > 0 ? { scope: [...new Set(scopes)].join(' ') } : {}),
  }

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
    .setIssuedAt()
    .setIssuer(options.issuer ?? config.AUTH_JWT_ISSUER)
    .setAudience(options.audience ?? config.AUTH_JWT_AUDIENCE)
    .setSubject(userId)
    .setExpirationTime('2h')
    .sign(privateKey)
}

export const signServiceJwt = async (
  clientId = 'komunitin-notifications',
  scopes: string[] = [Scope.SocialRead],
) => {
  return await new SignJWT({
    client_id: clientId,
    scope: scopes.join(' '),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
    .setIssuedAt()
    .setIssuer(config.AUTH_JWT_ISSUER)
    .setAudience(config.AUTH_JWT_AUDIENCE)
    .setSubject(clientId)
    .setExpirationTime('2h')
    .sign(privateKey)
}

export const serviceAuth = async (clientId = 'komunitin-notifications') => {
  return {
    id: clientId,
    token: await signServiceJwt(clientId),
  }
}

let userCounter = 0
/**
 * Helper function for tests.
 */
export const auth = async (subject?: string, email?: string, scope?: string | string[]) => {
  if (!subject) {
    userCounter++
    subject = `user-${userCounter}`
  }
  if (!email) {
    email = `${subject}@example.org`
  }
  const id = toUuid(subject)
  
  const token = await signJwt(id, email, scope)
  await seedUser({
    id,
    email,
    name: "Test User"
  })
  return { id, token, email }
}
