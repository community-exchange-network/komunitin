import { Keypair } from "@stellar/stellar-sdk"
import { CurrencyControllerImpl } from "./currency-controller"
import { AbstractCurrencyController } from "./abstract-currency-controller"
import type { KeyObject } from "node:crypto";
import { decrypt, encrypt } from "src/utils/crypto";
import { TenantPrismaClient } from "./multitenant";


/**
 * Return the Key id (= the public key).
 */
export async function storeCurrencyKey(key: Keypair, db: TenantPrismaClient, encryptionKey: () => Promise<KeyObject>) {
  const id = key.publicKey()
  const encryptedSecret = await encrypt(key.secret(), await encryptionKey())
  return (await db.encryptedSecret.create({
    data: {
      id,
      encryptedSecret
    }
  })).id
}

export class KeyController extends AbstractCurrencyController {

  constructor(
    readonly currencyController: CurrencyControllerImpl, 
    readonly sponsorKey: () => Promise<Keypair>,
    readonly encryptionKey: () => Promise<KeyObject>) {
    super(currencyController)
  }
  issuerKey() {
    return this.retrieveKey(this.currency().keys?.issuer as string)
  }
  creditKey() {
    return this.retrieveKey(this.currency().keys?.credit as string)
  }
  externalTraderKey() {
    return this.retrieveKey(this.currency().keys?.externalTrader as string)
  }
  externalIssuerKey() {
    return this.retrieveKey(this.currency().keys?.externalIssuer as string)
  }
  adminKey() {
    return this.retrieveKey(this.currency().keys?.admin as string)
  }


  async storeKey(key: Keypair) {
    return await storeCurrencyKey(key, this.db(), this.encryptionKey)
  }

  async retrieveKey(id: string) {
    const result = await this.db().encryptedSecret.findUniqueOrThrow({
      where: { id }
    })
    const secret = await decrypt(result.encryptedSecret, await this.encryptionKey())
    return Keypair.fromSecret(secret)
  }
}