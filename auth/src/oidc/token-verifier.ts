import { jwtVerify, type JWK, type JWTVerifyGetKey, type JWTVerifyOptions } from 'jose'
import { getJwks } from './jwks'

const toPublicJwk = (jwk: JWK & Record<string, unknown>): JWK => {
  const { d, p, q, dp, dq, qi, oth, ...publicJwk } = jwk
  return publicJwk
}

export async function verifySignedToken(token: string, options: JWTVerifyOptions) {
  const { keys } = await getJwks()
  const getKey: JWTVerifyGetKey = async ({ kid }) => {
    const jwk = typeof kid === 'string'
      ? keys.find((key) => key.kid === kid)
      : keys.length === 1 ? keys[0] : undefined

    if (!jwk) {
      throw new Error('No matching signing key')
    }

    return toPublicJwk(jwk)
  }

  return jwtVerify(token, getKey, options)
}
