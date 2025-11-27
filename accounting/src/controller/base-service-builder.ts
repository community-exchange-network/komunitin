import { PrismaClient } from "@prisma/client"
import { logger } from "../utils/logger"
import { sleep } from "../utils/sleep"
import { globalTenantDb, waitForDb } from "./multitenant"
import { Store } from "./store"
import { badConfig } from "../utils/error"
import { config } from "../config"
import { Keypair } from "@stellar/stellar-sdk"
import { friendbot } from "../ledger/stellar/friendbot"
import { deriveKey } from "../utils/crypto"
import { KeyObject } from "node:crypto"
import { createStellarLedger } from "../ledger"
import { BaseControllerImpl } from "./base-controller"
import { BaseService } from "./api"

const getSponsorAccount = async (store: Store) => {
  const SPONSOR_STORE_KEY = "sponsor_key"
  let sponsor: Keypair | undefined
  if (config.SPONSOR_PRIVATE_KEY) {
    sponsor = Keypair.fromSecret(config.SPONSOR_PRIVATE_KEY)
  }
  // Handy helper for dev/test environments.
  else if (["testnet", "local"].includes(config.STELLAR_NETWORK) && config.STELLAR_FRIENDBOT_URL) {
    const sponsorSecret = await store.get<string>(SPONSOR_STORE_KEY)
    if (sponsorSecret) {
      sponsor = Keypair.fromSecret(sponsorSecret)
      logger.info(`Sponsor account loaded from DB.`)
    } else {
      // Create a new random sponsor account with friendbot.
      sponsor = Keypair.random()
      await friendbot(config.STELLAR_FRIENDBOT_URL, sponsor.publicKey())
      await store.set(SPONSOR_STORE_KEY, sponsor.secret())
      logger.info(`Random sponsor account created with friendbot and saved.`)
    }
  } else {
    throw badConfig("Either SPONSOR_PRIVATE_KEY or STELLAR_FRIENDBOT_URL must be provided")
  }
  const sponsorKey = async () => sponsor
  return sponsorKey
}

const getChannelAccountKeys = async (store: Store) => {
  const CHANNEL_STORE_KEY = "channel_accounts"
  const CHANNEL_ACCOUNTS_NUMBER = 10
  if (config.STELLAR_CHANNEL_ACCOUNTS_ENABLED) {
    const channelAccountKeys = await store.get<string[]>(CHANNEL_STORE_KEY) ?? []
    let save = false
    while (channelAccountKeys.length < CHANNEL_ACCOUNTS_NUMBER) {
      save = true
      const key = Keypair.random()
      channelAccountKeys.push(key.secret())
    }

    if (save) {
      await store.set(CHANNEL_STORE_KEY, channelAccountKeys)
    }

    return channelAccountKeys
  } else {
    return undefined
  }
}

const getMasterKey = async () => {
  const masterPassword = config.MASTER_PASSWORD
  let masterKeyObject: KeyObject
  if (!masterPassword) { 
    throw badConfig("MASTER_PASSWORD must be provided")
  }
  if (masterPassword.length < 16) {
    throw badConfig("MASTER_PASSWORD must be at least 16 characters long")
  }
  if (!config.MASTER_PASSWORD_SALT || config.MASTER_PASSWORD_SALT.length < 16) {
    throw badConfig("MASTER_PASSWORD_SALT must be provided and at least 16 characters long")
  }
  const salt = config.MASTER_PASSWORD_SALT || "komunitin.org"
  masterKeyObject = await deriveKey(masterPassword, salt)

  return async () => masterKeyObject
}

export async function createBaseService(): Promise<BaseService> {
  // Create DB client.
  const db = new PrismaClient()
  await waitForDb(db)

  // Create global key-value store.
  const globalDb = globalTenantDb(db)
  const store = new Store(globalDb)
  
  // Master symmetric key for encrypting secrets.
  const masterKey = await getMasterKey()

  // Sponsor account
  const sponsorKey = await getSponsorAccount(store)
  const sponsor = await sponsorKey()

  // Create/retrieve channel accounts for parallel transactions.
  const channelAccountSecretKeys = await getChannelAccountKeys(store)

  const ledger = await createStellarLedger({
    server: config.STELLAR_HORIZON_URL,
    network: config.STELLAR_NETWORK,
    sponsorPublicKey: sponsor.publicKey(),
    domain: config.DOMAIN,
    channelAccountSecretKeys
  }, sponsor)

  return new BaseControllerImpl(ledger, db, masterKey, sponsorKey)
}
