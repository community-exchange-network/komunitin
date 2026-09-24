// Copied and adapted from accounting/test/keys.ts

import { config } from '../config'
import { type CryptoKey, generateKeyPair, exportJWK, SignJWT } from 'jose'

let privateKey: CryptoKey
let publicKey: CryptoKey
let jwks: any

export const generateKeys = async () => {
  const keys = await generateKeyPair('RS256', {
    modulusLength: 2048,
  })
  privateKey = keys.privateKey
  publicKey = keys.publicKey
  const jwk = await exportJWK(publicKey)
  // jose exportJWK does not include the kid, alg and use fields
  jwk.kid = 'test-key-id'
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  jwks = {
    keys: [jwk],
  }
}

export const getJwks = () => {
  return jwks
}

export const signJwt = async (
  userId: string,
  scopes: string[] = [],
  options: {
    audience?: string
    clientId?: string
    issuer?: string
    omitSubject?: boolean
  } = {},
) => {
  let token = new SignJWT({
    client_id: options.clientId ?? 'komunitin-app',
    scope: scopes.join(' '),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
    .setIssuedAt()
    .setIssuer(options.issuer ?? config.AUTH_JWT_ISSUER)
    .setAudience(options.audience ?? config.AUTH_JWT_AUDIENCE)
    .setExpirationTime('2h')

  if (!options.omitSubject) {
    token = token.setSubject(userId)
  }
  return token.sign(privateKey)
}

export const signServiceJwt = (
  clientId: string,
  scopes = ['notifications:write'],
  subject = clientId,
) => signJwt(subject, scopes, { clientId })
