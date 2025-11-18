import { AccountType, PrismaClient } from "@prisma/client"
import { Keypair } from "@stellar/stellar-sdk"
import cron from "node-cron"
import { KeyObject } from "node:crypto"
import { EventEmitter } from "node:events"
import { initUpdateExternalOffers } from "src/ledger/update-external-offers"
import { CollectionOptions, relatedCollectionParams } from "src/server/request"
import { Context, isSuperadmin, systemContext } from "src/utils/context"
import { badConfig, badRequest, forbidden, notFound, notImplemented, unauthorized } from "src/utils/error"
import { sleep } from "src/utils/sleep"
import TypedEmitter from "typed-emitter"
import { ControllerEvents, BaseController, StatsController } from "."
import { config } from "../config"
import { Ledger, createStellarLedger } from "../ledger"
import { friendbot } from "../ledger/stellar/friendbot"
import { CreateCurrency, Currency, CurrencySettings, currencyToRecord, recordToCurrency } from "../model/currency"
import { decrypt, deriveKey, encrypt, exportKey, importKey, randomKey } from "../utils/crypto"
import { logger } from "../utils/logger"
import { CurrencyControllerImpl, currencyConfig, currencyData } from "./currency-controller"
import { initUpdateCreditOnPayment } from "./features/credit-on-payment"
import { initNotifications } from "./features/notificatons"
import { storeCurrencyKey } from "./key-controller"
import { initLedgerListener } from "./ledger-listener"
import { PrivilegedPrismaClient, TenantPrismaClient, globalTenantDb, privilegedDb, tenantDb } from "./multitenant"
import { whereFilter } from "./query"
import { StatsControllerImpl as StatsControllerImpl } from "./stats-controller"
import { Store } from "./store"


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

const waitForDb = async (db: PrismaClient): Promise<void> => {
  try {
    // Do a simple query to check if the DB is ready.
    await db.value.findFirst()
  } catch (error) {
    logger.info(`Waiting for DB...`)
    await sleep(1000)
    return waitForDb(db)
  }
}

export async function createController(): Promise<BaseController> {
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

export class BaseControllerImpl implements BaseController {
  
  ledger: Ledger
  private _db: PrismaClient
  private cronTask: cron.ScheduledTask

  emitter: TypedEmitter<ControllerEvents>

  private sponsorKey: () => Promise<Keypair>
  private masterKey: () => Promise<KeyObject>

  stats: StatsController

  constructor(ledger: Ledger, db: PrismaClient, masterKey: () => Promise<KeyObject>, sponsorKey: () => Promise<Keypair>) {
    this.ledger = ledger
    this._db = db
    this.sponsorKey = sponsorKey
    this.masterKey = masterKey
    this.emitter = new EventEmitter() as TypedEmitter<ControllerEvents>

    // External trade sync
    initUpdateExternalOffers(ledger,
      sponsorKey,
      async (currency) => {
        const code = currency.asset().code
        const controller = await this.getCurrencyController(code)
        return controller.keys.externalTraderKey()
      })
    
    initLedgerListener(this)

    // Feature: update credit limit on received payments (for enabled currencies and accounts)
    initUpdateCreditOnPayment(this)

    // Feature: post events to notifications service.
    initNotifications(this)

    // run cron every 5 minutes.
    this.cronTask = cron.schedule("* * * * */5", () => {
      this.cron()
    })

    this.stats = new StatsControllerImpl(this.privilegedDb())
  }

  public addListener<E extends keyof ControllerEvents>(event: E, listener: ControllerEvents[E]) {
    return this.emitter.addListener(event, listener)
  }

  public removeListener<E extends keyof ControllerEvents>(event: E, listener: ControllerEvents[E]) {
    return this.emitter.removeListener(event, listener)
  }

  public privilegedDb(): PrivilegedPrismaClient {
    return privilegedDb(this._db)
  }

  public tenantDb(tenantId: string) : TenantPrismaClient {
    return tenantDb(this._db, tenantId)
  }

  async createCurrency(ctx: Context, currency: CreateCurrency): Promise<Currency> {
    // Validate input beyond syntactic validation.
    if (await this.currencyExists(currency.code)) {
      throw badRequest(`Currency with code ${currency.code} already exists`)
    }

    if (ctx.type !== "user" && ctx.type !== "system") {
      throw unauthorized("Required user or system credentials")
    }

    // Create and save a currency key that will be used to encrypt all other keys
    // related to this currency. This key itself is encrypted using the master key.
    const currencyKey = await randomKey()
    const encryptedCurrencyKey = await this.storeKey(currency.code, currencyKey)
    
    // Default settings:
    const defaultSettings: CurrencySettings = {
      defaultInitialCreditLimit: 0,
      defaultInitialMaximumBalance: false,
      defaultAllowPayments: true,
      defaultAllowPaymentRequests: true,
      defaultAcceptPaymentsAutomatically: false,
      defaultAcceptPaymentsWhitelist: [],
      defaultAllowSimplePayments: true,
      defaultAllowSimplePaymentRequests: true,
      defaultAllowQrPayments: true,
      defaultAllowQrPaymentRequests: true,
      defaultAllowMultiplePayments: true,
      defaultAllowMultiplePaymentRequests: true,
      defaultAllowTagPayments: true,
      defaultAllowTagPaymentRequests: false,

      defaultAcceptPaymentsAfter: 14*24*60*60, // 2 weeks,
      defaultOnPaymentCreditLimit: false,

      enableExternalPayments: true,
      enableExternalPaymentRequests: false,
      enableCreditCommonsPayments: false,
      defaultAllowExternalPayments: true,
      defaultAllowExternalPaymentRequests: false,
      defaultAcceptExternalPaymentsAutomatically: false,
      
      externalTraderCreditLimit: currency.settings.defaultInitialCreditLimit ?? 0,
      externalTraderMaximumBalance: false,
    }

    // Merge default settings with provided settings, while deleting eventual extra fields.
    const settings = {} as Record<string, any>
    for (const key in defaultSettings) {
      const tkey = key as keyof CurrencySettings
      settings[key] = currency.settings[tkey] ?? defaultSettings[tkey]
    }
    currency.settings = settings as CurrencySettings

    // Add the currency to the DB
    const inputRecord = currencyToRecord(currency)
    const db = this.tenantDb(currency.code)

    if (currency.admins && currency.admins.length > 1) {
      throw notImplemented("Multiple admins not supported")
    }

    // Use logged in user as admin if not provided.
    const admin = currency.admins && currency.admins.length > 0 
      ? currency.admins[0].id 
      : ctx.userId
    
    if (!admin) {
      throw badRequest("Admin user must be provided explicitly or as logged in user")
    }

    // Check that the user is not already being used in other tenant.
    const user = await this.privilegedDb().user.findFirst({where: { id: admin }})
    if (user) {
      throw badRequest(`User ${admin} is already being used in another tenant`)
    }

    // Create the currency on the ledger.
    const keys = await this.ledger.createCurrency(
      currencyConfig(currency), 
      await this.sponsorKey()
    )

    // Create the currency record in the DB
    let record = await db.currency.create({
      data: {
        ...inputRecord,
        status: "new",
        encryptionKey: {
          connect: {
            id: encryptedCurrencyKey.id
          }
        },
        admin: {
          connectOrCreate: {
            where: { 
              tenantId_id: {
                id: admin,
                tenantId: db.tenantId
              }
            },
            create: { id: admin }
          }
        }
      },
    })
    
    // Store the keys into the DB, encrypted using the currency key.
    const storeKey = (key: Keypair) => storeCurrencyKey(key, db, async () => currencyKey)
    const currencyKeyIds = {
      issuerKeyId: await storeKey(keys.issuer),
      creditKeyId: await storeKey(keys.credit),
      adminKeyId: await storeKey(keys.admin),
      externalIssuerKeyId: await storeKey(keys.externalIssuer),
      externalTraderKeyId: await storeKey(keys.externalTrader)
    }

    // Create the virtual local account for external transactions
    const externalAccountRecord = await db.account.create({
      data: {
        code: `${inputRecord.code}EXTR`,
        type: AccountType.virtual,
        status: "active",
        balance: 0,
        maximumBalance: currency.settings.externalTraderMaximumBalance ? currency.settings.externalTraderMaximumBalance : null,
        creditLimit: currency.settings.externalTraderCreditLimit ?? 0,
        key: { connect: { id: currencyKeyIds.externalTraderKeyId }},
        settings: {
          allowPayments: false,
          allowPaymentRequests: false
        },
        currency: { connect: { id: record.id }},
        // no users for virtual account.
      }
    })

    // Update the currency record in DB
    record = await db.currency.update({
      where: { id: record.id },
      data: {
        status: "active",
        ...currencyKeyIds,
        externalAccountId: externalAccountRecord.id
      },
      include: {
        externalAccount: true
      }
    })

    return recordToCurrency(record)

  }
  /**
   * Implements {@link BaseController.getCurrencies}
   */
  async getCurrencies(ctx: Context, params: CollectionOptions): Promise<Currency[]> {
    if ("status" in params.filters && params.filters.status !== "active" && !isSuperadmin(ctx)) {
      throw forbidden("Only superadmins can filter by status")
    }
    const filter = whereFilter(params.filters)
    
    const records = await this.privilegedDb().currency.findMany({
      where: {
        status: "active",
        ...filter
      },
      orderBy: {
        [params.sort.field]: params.sort.order
      },
      skip: params.pagination.cursor,
      take: params.pagination.size,
    })
    const currencies = records.map(r => recordToCurrency(r))
    return currencies
  }

  private async loadCurrency(code: string): Promise<Currency> {
    const record = await this.tenantDb(code).currency.findUnique({
      where: { code },
      include: {
        externalAccount: true
      }
    })
    if (!record) {
      throw notFound(`Currency with code ${code} not found`)
    }
    return recordToCurrency(record)
  }

  async currencyExists(code: string): Promise<boolean> {
    const result = await this.tenantDb(code).currency.findUnique({
      select: { code: true },
      where: { code }
    })
    return result !== null
  }

  /**
   * Stores a key into the DB, encrypted with the master key. Used to store currency master
   * encryption key.
   */
  async storeKey(code: string, key: KeyObject) {
    const encryptedSecret = await encrypt(exportKey(key), await this.masterKey())
    return await this.tenantDb(code).encryptedSecret.create({
      data: {
        encryptedSecret
      }
    })
  }

  async retrieveKey(code: string, id: string) {
    const result = await this.tenantDb(code).encryptedSecret.findUniqueOrThrow({
      where: { id }
    })
    const secret = await decrypt(result.encryptedSecret, await this.masterKey())
    return importKey(secret)
  }

  async stop() {
    this.cronTask.stop()
    this.ledger.stop()
    this.emitter.removeAllListeners()
    await this._db.$disconnect()
  }

  async getCurrencyController(code: string): Promise<CurrencyControllerImpl> {
    const currency = await this.loadCurrency(code)
    const ledgerCurrency = this.ledger.getCurrency(currencyConfig(currency), currencyData(currency), currency.state)
    const db = this.tenantDb(code)
    const encryptionKey = () => this.retrieveKey(code, currency.encryptionKey)
    return new CurrencyControllerImpl(currency, ledgerCurrency, db, encryptionKey, this.sponsorKey, this.emitter)
  }

  async cron() {
    logger.info("Running cron")
    // Run cron for each currency.
    try {
      const ctx = systemContext()
      const currencies = await this.getCurrencies(ctx, relatedCollectionParams())
      for (const currency of currencies) {
        const currencyController = await this.getCurrencyController(currency.code)
        await currencyController.cron(ctx)
      }
    } catch (e) {
      logger.error(e, "Error running cron")
    }
  }

}

