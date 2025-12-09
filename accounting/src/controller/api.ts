
import { AccountStatsOptions, CollectionOptions, StatsOptions } from "../server/request"
import { CreateCurrency, Currency, UpdateCurrency, FullTransfer, InputAccount, UpdateAccount, InputTransfer, UpdateTransfer, AccountSettings, CurrencySettings, Account, Transfer, UpdateCurrencySettings, FullAccount } from "../model"
import { Context } from "../utils/context"
import { InputTrustline, Trustline, UpdateTrustline } from "src/model/trustline"
import { Stats } from "src/model/stats"
import TypedEmitter from "typed-emitter"
import { PrivilegedPrismaClient, TenantPrismaClient } from "./multitenant"
import { UserController } from "./user-controller"
import { KeyController } from "./key-controller"
import { ExternalResourceController } from "./external-resource-controller"
import { AtLeast } from "../utils/types"

/**
 * Controller for operations not related to a particular currency.
 */
export interface BasePublicService {
  stats: StatsPublicService
  createCurrency(ctx: Context, currency: CreateCurrency): Promise<Currency>
  getCurrencies(ctx: Context, params: CollectionOptions): Promise<Currency[]>
}

export type ServiceEvents = {
  /**
   * This event is emitted when a transfer is created, committed,
   * rejected, deleted, etc.
   */
  transferStateChanged: (transfer: FullTransfer, controller: CurrencyPublicService) => void
}

export interface BaseService extends BasePublicService {
  stop(): Promise<void>
  
  addListener: TypedEmitter<ServiceEvents>['addListener']
  removeListener: TypedEmitter<ServiceEvents>['removeListener']

  tenantDb(code: string): TenantPrismaClient
  privilegedDb(): PrivilegedPrismaClient

  getCurrencyController(code: string): Promise<CurrencyService>
}

/**
 * Controller for operations related to a particular currency.
 */
export interface CurrencyPublicService {
  accounts: AccountsPublicService
  transfers: TransfersPublicService
  stats: StatsPublicService

  // Currency
  getCurrency(ctx: Context): Promise<Currency>
  updateCurrency(ctx: Context, currency: UpdateCurrency): Promise<Currency>

  // Currency settings
  getCurrencySettings(ctx: Context): Promise<CurrencySettings>
  updateCurrencySettings(ctx: Context, settings: UpdateCurrencySettings): Promise<CurrencySettings>

  // Trustlines
  getTrustline(ctx: Context, id: string): Promise<Trustline>
  createTrustline(ctx: Context, trustline: InputTrustline): Promise<Trustline>
  updateTrustline(ctx: Context, trustline: UpdateTrustline): Promise<Trustline>
  getTrustlines(ctx: Context, params: CollectionOptions): Promise<Trustline[]>
}

export interface CurrencyService extends CurrencyPublicService {
  model: Currency
  db: TenantPrismaClient
  users: UserController
  keys: KeyController
  accounts: AccountsService
  externalResources: ExternalResourceController

  // Allow other modules to save additional settings on the currency settings
  getCurrencySettings<T extends CurrencySettings>(ctx: Context): Promise<T>
  updateCurrencySettings<T extends CurrencySettings>(ctx: Context, settings: AtLeast<T,"id">): Promise<T>

  /**
   * Convert an amount between its integer representation (scaled by currency's scale)
   * and its string representation (with decimal point).
   * @param amount 
   */
  toStringAmount(amount: number): string
  
  /**
   * Convert an amount between its string representation (with decimal point)
   * and its integer representation (scaled by currency's scale).
   * @param amount 
   */
  toIntegerAmount(amount: string): number
}

/**
 * Controller for account-related operations.
 */
export interface AccountsPublicService {
  // Accounts
  createAccount(ctx: Context, account: InputAccount): Promise<Account>
  getAccount(ctx: Context, id: string): Promise<Account>
  getAccounts(ctx: Context, params: CollectionOptions): Promise<Account[]>
  updateAccount(ctx: Context, data: UpdateAccount): Promise<Account>;
  deleteAccount(ctx: Context, id: string): Promise<void>;

  // Account settings
  getAccountSettings(ctx: Context, id: string): Promise<AccountSettings>
  updateAccountSettings(ctx: Context, settings: AccountSettings): Promise<AccountSettings>
  
}

/**
 * Internal controller for account-related operations.
 */
export interface AccountsService extends AccountsPublicService {
  getFullAccount(id: string, checkActive?: boolean): Promise<FullAccount>
}

/**
 * Controller for transfer-related operations.
 */
export interface TransfersPublicService {
  createTransfer(ctx: Context, transfer: InputTransfer): Promise<FullTransfer>
  createMultipleTransfers(ctx: Context, transfers: InputTransfer[]): Promise<FullTransfer[]>
  getTransfer(ctx: Context, id: string): Promise<Transfer>
  getTransfers(ctx: Context, params: CollectionOptions): Promise<Transfer[]>
  updateTransfer(ctx: Context, transfer: UpdateTransfer): Promise<FullTransfer>
  deleteTransfer(ctx: Context, id: string): Promise<void>
}

/**
 * Controller for statistics-related operations.
 */
export interface StatsPublicService {
  getAmount(ctx: Context, params: StatsOptions): Promise<Stats>
  getAccounts(ctx: Context, params: AccountStatsOptions): Promise<Stats>
  getTransfers(ctx: Context, params: StatsOptions): Promise<Stats>
}
