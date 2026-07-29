import { exportJWK, generateKeyPair, SignJWT } from 'jose'
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
) => {
  const payload: Record<string, unknown> = { email }
  if (scope) {
    payload.scope = Array.isArray(scope) ? scope.join(' ') : scope
  }

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
    .setIssuedAt()
    .setIssuer('https://komunitin.org')
    .setAudience('komunitin-app')
    .setSubject(userId)
    .setExpirationTime('2h')
    .sign(privateKey)
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
