
import { AccountStatsOptions, CollectionOptions, StatsOptions } from "../server/request"
import { CreateCurrency, Currency, UpdateCurrency, FullTransfer, FullAccount, InputAccount, UpdateAccount, InputTransfer, UpdateTransfer, AccountSettings, CurrencySettings, Account, Transfer, UpdateCurrencySettings } from "../model"
export { createController } from "./base-controller"
import { Context } from "../utils/context"
import TypedEmitter from "typed-emitter"
import { InputTrustline, Trustline, UpdateTrustline } from "src/model/trustline"
import { Stats } from "src/model/stats"
import { CreditCommonsController } from "src/creditcommons/credit-commons-controller";
import { PrivilegedPrismaClient, TenantPrismaClient } from "./multitenant"


export type ControllerEvents = {
  /**
   * This event is emitted when a transfer is created, committed,
   * rejected, deleted, etc.
   */
  transferStateChanged: (transfer: FullTransfer, controller: CurrencyController) => void
}

/**
 * Controller for operations not related to a particular currency.
 */
export interface SharedController {
  stats: StatsController

  getCurrencyController(code: string): Promise<CurrencyController>   
  

  createCurrency(ctx: Context, currency: CreateCurrency): Promise<Currency>
  getCurrencies(ctx: Context, params: CollectionOptions): Promise<Currency[]>

  stop(): Promise<void>
  
  addListener: TypedEmitter<ControllerEvents>['addListener']
  removeListener: TypedEmitter<ControllerEvents>['removeListener']

  tenantDb(code: string): TenantPrismaClient
  privilegedDb(): PrivilegedPrismaClient
}
/**
 * Controller for operations related to a particular currency.
 */
export interface CurrencyController {
  // Child controllers
  accounts: AccountController
  transfers: TransferController
  creditCommons: CreditCommonsController

  stats: StatsController
  
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

export interface AccountController {
  createAccount(ctx: Context, account: InputAccount): Promise<Account>
  getAccount(ctx: Context, id: string): Promise<Account>
  getAccounts(ctx: Context, params: CollectionOptions): Promise<Account[]>
  updateAccount(ctx: Context, data: UpdateAccount): Promise<Account>;
  deleteAccount(ctx: Context, id: string): Promise<void>;

  getAccountSettings(ctx: Context, id: string): Promise<AccountSettings>
  updateAccountSettings(ctx: Context, settings: AccountSettings): Promise<AccountSettings>
  
}

export interface TransferController {
  createTransfer(ctx: Context, transfer: InputTransfer): Promise<FullTransfer>
  createMultipleTransfers(ctx: Context, transfers: InputTransfer[]): Promise<FullTransfer[]>
  getTransfer(ctx: Context, id: string): Promise<Transfer>
  //getFullTransferByHash(ctx: Context, hash: string): Promise<FullTransfer>
  getTransfers(ctx: Context, params: CollectionOptions): Promise<Transfer[]>
  updateTransfer(ctx: Context, transfer: UpdateTransfer): Promise<FullTransfer>
  deleteTransfer(ctx: Context, id: string): Promise<void>
}

export interface StatsController {
  getAmount(ctx: Context, params: StatsOptions): Promise<Stats>
  getAccounts(ctx: Context, params: AccountStatsOptions): Promise<Stats>
  getTransfers(ctx: Context, params: StatsOptions): Promise<Stats>
}
