
import { Keypair } from "@stellar/stellar-sdk"
import { describe, it } from "node:test"
import assert from "node:assert"
import { importEd25519RawPrivateKey } from "src/utils/crypto"
import { createExternalToken, verifyExternalToken } from "src/controller/external-jwt"


describe('Crypto', async () => {
  it('Import Ed25519 private key', async () => {
    const key = Keypair.random()
    const keyObj = await importEd25519RawPrivateKey(key.rawSecretKey())
    const jwk = keyObj.export({format: "jwk"})
    assert.equal(jwk.crv, "Ed25519")
  })

  it('Import Ed25519 public key', async () => {
    const key = Keypair.random()
    const keyObj = await importEd25519RawPrivateKey(key.rawPublicKey())
    const jwk = keyObj.export({format: "jwk"})
    assert.equal(jwk.crv, "Ed25519")
  })

  it ('Creates and verifies external token', async () => {
    const key = Keypair.random()
    const token = await createExternalToken(key)
    const result = await verifyExternalToken(token)
    assert.equal(result.payload.type, "external")
    assert.equal(result.payload.aud, "komunitin-app")
  })

  it('Fails to verify external token with wrong signature', async () => {
    const replaceChar = (str: string, index: number) => {
      const char = str[index]
      const newChar = char == "a" ? "b" : "a"
      return str.slice(0, index) + newChar + str.slice(index + 1)
    }

    const key = Keypair.random()
    const token = await createExternalToken(key)

    // Change an arbitrary character in the token signature
    const corrupted = replaceChar(token, token.length - 4)
    
    await assert.rejects(async () => {
      // Using a function to ensure errors are converted to promise rejections.
      await verifyExternalToken(corrupted)
    })
  })

})
