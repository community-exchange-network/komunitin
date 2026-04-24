import { Keypair } from "@stellar/stellar-sdk"
import { SignJWT, decodeJwt, jwtVerify } from "jose"
import { config } from "../config"
import { importEd25519RawPrivateKey, importEd25519RawPublicKey } from "../utils/crypto"
import { unauthorized } from "../utils/error"

export const verifyExternalToken = async (token: string) => {
  const claims = decodeJwt(token)
  if (!claims.sub) {
    throw unauthorized("Missing sub claim in JWT.")
  }
  const publicKey = Keypair.fromPublicKey(claims.sub).rawPublicKey()
  const keyObject = await importEd25519RawPublicKey(publicKey)

  const result = await jwtVerify(token, keyObject, {
    algorithms: ["EdDSA"],
    audience: config.AUTH_JWT_AUDIENCE,
    clockTolerance: 60 * 5, // 5 minutes
    maxTokenAge: "1h",
  })

  return {
    header: result.protectedHeader,
    payload: {
      ...result.payload,
      type: "external"
    },
    token: token,
  }
}

export const createExternalToken = async (key: Keypair) => {
  const bytes = key.rawSecretKey()
  const privateKey = await importEd25519RawPrivateKey(bytes)
  
  const token = await new SignJWT({})
    .setProtectedHeader({alg: "EdDSA"})
    .setIssuer(config.API_BASE_URL)
    .setAudience("komunitin-app")
    .setExpirationTime("1h")
    .setIssuedAt()
    .setSubject(key.publicKey())
    .sign(privateKey)

  return token
}
