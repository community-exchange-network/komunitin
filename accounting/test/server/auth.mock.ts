import { generateKeyPairSync } from "node:crypto"
import { SignJWT, JSONWebKeySet } from "jose"
import { config } from "../../src/config"
import { testUserId } from "./api.data"

const keys = generateKeyPairSync("rsa", {
  modulusLength: 2048,
})
const TEST_KEY_ID = "test-key-id"

export async function token(user: string, scopes?: string[], audience?: string, clientId?: string, issuer?: string) {
  const payload = {} as Record<string, string>
  if (scopes) {
    payload.scope = scopes.join(" ")
  }
  if (clientId) {
    payload.client_id = clientId
  }
  const token = await new SignJWT(payload)
    .setAudience(audience ?? config.AUTH_JWT_AUDIENCE)
    .setIssuer(issuer ?? config.AUTH_JWT_ISSUER)
    .setSubject(clientId ? user : testUserId(user))
    .setIssuedAt()
    .setExpirationTime("1h")
    .setProtectedHeader({alg: "RS256", kid: TEST_KEY_ID})
    .sign(keys.privateKey)
  return token
}

export function jwks(): JSONWebKeySet {
  return {
    keys: [{
      ...keys.publicKey.export({ format: "jwk" }),
      kid: TEST_KEY_ID,
      alg: "RS256",
      use: "sig",
    }]
  }
}
