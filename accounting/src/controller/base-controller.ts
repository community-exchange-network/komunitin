import { AccountKind, PrismaClient } from "@prisma/client"
import { Keypair } from "@stellar/stellar-sdk"
import cron from "node-cron"
import { KeyObject } from "node:crypto"
import { EventEmitter } from "node:events"
import { initUpdateExternalOffers } from "../ledger/update-external-offers"
import { CollectionOptions, relatedCollectionParams } from "../server/request"
import { Context, isSuperadmin, systemContext } from "../utils/context"
import { badRequest, forbidden, notFound, notImplemented, unauthorized } from "../utils/error"
import TypedEmitter from "typed-emitter"
import { Ledger, LedgerCurrencyKeys } from "../ledger"
import { CreateCurrency, Currency, CurrencySettings, currencyToRecord, recordToCurrency } from "../model/currency"
import { randomKey } from "../utils/crypto"
import { logger } from "../utils/logger"
import { BasePublicService, ServiceEvents } from "./api"
import { currencyConfig, currencyData, CurrencyControllerImpl, defaultCurrencySettings } from "./currency-controller"
import { initUpdateCreditOnPayment } from "./features/credit-on-payment"
import { initNotifications } from "./features/notificatons"
import { retrieveEncryptionKey, storeCurrencyKey, storeEncryptionKey } from "./key-controller"
import { initLedgerListener } from "./ledger-listener"
import { PrivilegedPrismaClient, TenantPrismaClient, privilegedDb, tenantDb } from "./multitenant"
import { whereFilter } from "./query"
import { StatsControllerImpl } from "./stats-controller"

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

  public tenantDb(tenantId: string): TenantPrismaClient {
    return tenantDb(this._db, tenantId)
  }

  async createCurrency(ctx: Context, currency: CreateCurrency, suppliedKeys?: LedgerCurrencyKeys): Promise<Currency> {
    // Validate input beyond syntactic validation.
    if (await this.currencyExists(currency.code)) {
      throw badRequest(`Currency with code ${currency.code} already exists`)
    }

    if (ctx.type !== "user" && ctx.type !== "system" && ctx.type !== "superadmin") {
      throw unauthorized("Required user, system or superadmin credentials")
    }

    // Default settings:
    const defaultSettings: CurrencySettings = defaultCurrencySettings(currency)

    // Merge default settings with provided settings, while deleting eventual extra fields.
    const settings = {} as Record<string, any>
    for (const key in defaultSettings) {
      const tkey = key as keyof CurrencySettings
      settings[key] = currency.settings?.[tkey] ?? defaultSettings[tkey]
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
    const user = await this.privilegedDb().user.findFirst({ where: { id: admin } })
    if (user) {
      throw badRequest(`User ${admin} is already being used in another tenant`)
    }

    // Create the currency on the ledger.
    const keys = await this.ledger.createCurrency(
      currencyConfig(currency),
      await this.sponsorKey(),
      suppliedKeys
    )

    // Commit the complete currency at once. If persistence fails after provisioning,
    // the caller can retry with the same ledger keys without a partial currency record.
    const currencyKey = await randomKey()
    const record = await db.transaction(async tx => {
      const encryptionKeyId = await storeEncryptionKey(currencyKey, tx, this.masterKey)
      const storeKey = (key: Keypair) => storeCurrencyKey(key, tx, async () => currencyKey)
      const currencyKeyIds = {
        issuerKeyId: await storeKey(keys.issuer),
        creditKeyId: await storeKey(keys.credit),
        adminKeyId: await storeKey(keys.admin),
        externalIssuerKeyId: await storeKey(keys.externalIssuer),
        externalTraderKeyId: await storeKey(keys.externalTrader),
        disabledAccountsPoolKeyId: keys.disabledAccountsPool ? await storeKey(keys.disabledAccountsPool) : undefined
      }
      const currencyRecord = await tx.currency.create({
        data: {
          ...inputRecord,
          status: "active",
          encryptionKey: { connect: { id: encryptionKeyId } },
          issuerKey: { connect: { id: currencyKeyIds.issuerKeyId } },
          creditKey: { connect: { id: currencyKeyIds.creditKeyId } },
          adminKey: { connect: { id: currencyKeyIds.adminKeyId } },
          externalIssuerKey: { connect: { id: currencyKeyIds.externalIssuerKeyId } },
          externalTraderKey: { connect: { id: currencyKeyIds.externalTraderKeyId } },
          disabledAccountsPoolKey: currencyKeyIds.disabledAccountsPoolKeyId ? { connect: { id: currencyKeyIds.disabledAccountsPoolKeyId } } : undefined,
          admin: { create: { id: admin } }
        }
      })
      const externalAccount = await tx.account.create({
        data: {
          code: `${currency.code}EXTR`,
          kind: AccountKind.virtual,
          status: "active",
          balance: 0,
          maximumBalance: settings.externalTraderMaximumBalance === false ? null : settings.externalTraderMaximumBalance,
          creditLimit: settings.externalTraderCreditLimit,
          settings: {
            allowPayments: false,
            allowPaymentRequests: false 
          },
          key: { connect: { id: currencyKeyIds.externalTraderKeyId } },
          currency: { connect: { id: currencyRecord.id } }
        }
      })
      return tx.currency.update({
        where: { id: currencyRecord.id },
        data: { externalAccountId: externalAccount.id },
        include: { externalAccount: true }
      })
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
      where: {
        code,
        status: { not: "deleted" },
      },
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
   * Store a migration encryption key using the service master key.
   */
  async storeEncryptionKey(code: string, key: KeyObject) {
    const id = await storeEncryptionKey(key, this.tenantDb(code), this.masterKey)
    return { id }
  }

  async retrieveEncryptionKey(code: string, id: string) {
    return retrieveEncryptionKey(id, this.tenantDb(code), this.masterKey)
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
    const encryptionKey = () => this.retrieveEncryptionKey(code, currency.encryptionKey)
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
