import { generateKeyPairSync } from "node:crypto"
import { SignJWT, JSONWebKeySet } from "jose"
import { config } from "../../src/config"
import { Scope } from "../../src/server/auth"

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})

export async function token(user: string|null, scopes?: Scope[], audience?: string) {
  const payload = {} as Record<string, string>
  if (scopes) {
    payload.scope = scopes.join(" ")
  }
  const token = await new SignJWT(payload)
    .setAudience(audience ?? config.AUTH_JWT_AUDIENCE[0])
    .setIssuer(config.AUTH_JWT_ISSUER)
    .setSubject(user as string)
    .setIssuedAt()
    .setExpirationTime("1h")
    .setProtectedHeader({alg: "RS256"})
    .sign(keys.privateKey)
  return token
}

export function jwks(): JSONWebKeySet {
  return {
    keys: [keys.publicKey.export({
      format: "jwk"
    })]
  }
}