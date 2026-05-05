import { exportJWK, generateKeyPair, SignJWT } from 'jose'

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

export const signJwt = async (userId: string, email = 'user@example.org') => {
  return await new SignJWT({ email })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key-id' })
    .setIssuedAt()
    .setIssuer('https://komunitin.org')
    .setAudience('komunitin-app')
    .setSubject(userId)
    .setExpirationTime('2h')
    .sign(privateKey)
}
