import { Keypair } from "@stellar/stellar-sdk"
import { CurrencyControllerImpl } from "./currency-controller"
import { AbstractCurrencyController } from "./abstract-currency-controller"
import type { KeyObject } from "node:crypto";
import { decrypt, encrypt, exportKey, importKey } from "../utils/crypto";
import type { Prisma } from "@prisma/client"
import type { TenantPrismaClient } from "./multitenant"

async function storeEncryptedSecret(secret: string, db: TenantPrismaClient | Prisma.TransactionClient, encryptionKey: () => Promise<KeyObject>, id?: string) {
  const encryptedSecret = await encrypt(secret, await encryptionKey())
  return (await db.encryptedSecret.create({ data: { id, encryptedSecret } })).id
}

async function retrieveEncryptedSecret(id: string, db: TenantPrismaClient | Prisma.TransactionClient, encryptionKey: () => Promise<KeyObject>) {
  const result = await db.encryptedSecret.findUniqueOrThrow({ where: { id } })
  return decrypt(result.encryptedSecret, await encryptionKey())
}

/** 
 * Store a currency encryption key encrypted under the service master key and return its id.
 * */
export async function storeEncryptionKey(key: KeyObject, db: TenantPrismaClient | Prisma.TransactionClient, masterKey: () => Promise<KeyObject>) {
  return storeEncryptedSecret(exportKey(key), db, masterKey)
}

/** Retrieve an encryption key encrypted under the service master key. */
export async function retrieveEncryptionKey(id: string, db: TenantPrismaClient | Prisma.TransactionClient, masterKey: () => Promise<KeyObject>) {
  return importKey(await retrieveEncryptedSecret(id, db, masterKey))
}

/**
 * Store an account secret key encrypted under the currency master key.
 */
export async function storeCurrencyKey(key: Keypair, db: TenantPrismaClient | Prisma.TransactionClient, encryptionKey: () => Promise<KeyObject>) {
  return storeEncryptedSecret(key.secret(), db, encryptionKey, key.publicKey())
}

/** Retrieve an account signing key encrypted under the currency master key. */
export async function retrieveCurrencyKey(id: string, db: TenantPrismaClient | Prisma.TransactionClient, encryptionKey: () => Promise<KeyObject>) {
  return Keypair.fromSecret(await retrieveEncryptedSecret(id, db, encryptionKey))
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
    return retrieveCurrencyKey(id, this.db(), this.encryptionKey)
  }
}
