import { AccountType, PrismaClient } from "@prisma/client"
import { Keypair } from "@stellar/stellar-sdk"
import cron from "node-cron"
import { KeyObject } from "node:crypto"
import { EventEmitter } from "node:events"
import { initUpdateExternalOffers } from "src/ledger/update-external-offers"
import { CollectionOptions, relatedCollectionParams } from "src/server/request"
import { Context, isSuperadmin, systemContext } from "src/utils/context"
import { badRequest, forbidden, notFound, notImplemented, unauthorized } from "src/utils/error"
import TypedEmitter from "typed-emitter"
import { Ledger,  } from "../ledger"
import { CreateCurrency, Currency, CurrencySettings, currencyToRecord, recordToCurrency } from "../model/currency"
import { decrypt, encrypt, exportKey, importKey, randomKey } from "../utils/crypto"
import { logger } from "../utils/logger"
import { CurrencyControllerImpl, currencyConfig, currencyData } from "./currency-controller"
import { initUpdateCreditOnPayment } from "./features/credit-on-payment"
import { initNotifications } from "./features/notificatons"
import { storeCurrencyKey } from "./key-controller"
import { initLedgerListener } from "./ledger-listener"
import { PrivilegedPrismaClient, TenantPrismaClient, privilegedDb, tenantDb } from "./multitenant"
import { whereFilter } from "./query"
import { StatsControllerImpl as StatsControllerImpl } from "./stats-controller"
import { BasePublicService, ServiceEvents } from "./api"

export class BaseControllerImpl implements BasePublicService {
  
  ledger: Ledger
  private _db: PrismaClient
  private cronTask: cron.ScheduledTask

  emitter: TypedEmitter<ServiceEvents>

  private sponsorKey: () => Promise<Keypair>
  private masterKey: () => Promise<KeyObject>

  stats: StatsControllerImpl

  constructor(ledger: Ledger, db: PrismaClient, masterKey: () => Promise<KeyObject>, sponsorKey: () => Promise<Keypair>) {
    this.ledger = ledger
    this._db = db
    this.sponsorKey = sponsorKey
    this.masterKey = masterKey
    this.emitter = new EventEmitter() as TypedEmitter<ServiceEvents>

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

  public addListener<E extends keyof ServiceEvents>(event: E, listener: ServiceEvents[E]) {
    return this.emitter.addListener(event, listener)
  }

  public removeListener<E extends keyof ServiceEvents>(event: E, listener: ServiceEvents[E]) {
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

