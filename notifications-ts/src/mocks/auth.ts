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

export const signJwt = async (userId: string, scopes: string[] = []) => {
  return await new SignJWT({
    scope: scopes.join(' '),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
    .setIssuedAt()
    .setIssuer(config.AUTH_JWT_ISSUER)
    .setAudience(config.AUTH_JWT_AUDIENCE)
    .setSubject(userId)
    .setExpirationTime('2h')
    .sign(privateKey)
}
