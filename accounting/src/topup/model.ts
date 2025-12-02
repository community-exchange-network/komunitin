import { User, Account, Transfer } from "../model"
import { RelatedResource } from "../model/resource"
import { Topup as TopupRecord } from "@prisma/client"
import { AtLeast, Rate } from "../utils/types"
import { PaymentStatus } from "@mollie/api-client"

export type DepositCurrency = "EUR"
export type TopupStatus = 
    "new"                // Topup created in database, not yet contacted payment provider
  | "pending"            // Payment link created at payment provider, waiting for user to pay
  | "payment_completed"  // Payment received at payment provider
  | "payment_failed"     // Payment failed at payment provider
  | "transfer_completed" // Transfer committed to credit the account
  | "transfer_failed"    // Transfer to credit the account failed
  | "canceling"          // Topup being cancelled by user or system (before payment)
  | "canceled"           // Topup cancelled (and payment link also cancelled if applicable)
export type TopupPaymentProvider = "mollie"

export type TopupMeta = {
  description?: string
}

export interface Topup {
  id: string

  status: TopupStatus
  
  /**
   * Amount deposited by the user in smallest currency unit (e.g. 1234 for €12.34)
   */
  depositAmount: number
  depositCurrency: DepositCurrency

  /**
   * Amount to be received using currency's scale.
   */
  receiveAmount: number

  paymentProvider: TopupPaymentProvider
  paymentData: MolliePaymentData | null
  meta: TopupMeta | null

  account: Account
  transfer: Transfer | null
  user: User
  
  created: Date
  updated: Date
}

export type InputTopup = AtLeast<Topup, "depositAmount" | "depositCurrency" | "meta"> & { "account" : RelatedResource }
export type UpdateTopup = AtLeast<Topup, "id" | "status" | "depositAmount" | "depositCurrency" | "meta"> & { "account" : RelatedResource }

export interface MolliePaymentData {
  paymentId: string
  checkoutUrl: string
  status: PaymentStatus
}

export type InputTopupSettings = Partial<TopupSettings>

export interface TopupSettings {
  /**
   * Same id as the currency.
   */
  id: string
  /**
   * Whether topups are enabled for this currency.
   */
  enabled: boolean,
  /**
   * Wheter accounts can topup by default.
   */
  defaultAllowTopup: boolean
  /**
   * Only "EUR" is supported for now.
   */
  depositCurrency: "EUR",
  /**
   * How much currency units correspond to one unit of deposit currency, where
   * currency units are defined using currency's scale and deposit currency uses
   * its minimum unit (e.g. cents for EUR).
   * 
   * Eg, if 11 EUR correspond to 15 currency units with scale 6, then 
   * rate = {n: 15000000, d: 1100} = {n: 150000, d: 11}
   * 
   * So receiveAmount = floor(depositAmount * n / d)
   */
  rate: Rate,
  /**
   * Only "mollie" is supported for now.
   */
  paymentProvider: "mollie",
  /**
   * Minimum topup amount in smallest currency unit.
   */
  minAmount: number,
  /**
   * Maximum topup amount in smallest currency unit, or false for no limit.
   */
  maxAmount: number | false
  /**
   * Source account id to use for topup transfers.
   */
  sourceAccountId: string | null
}

export interface AccountTopupSettings {
  /**
   * Account id
   */
  id: string
  /**
   * Whether to allow topups for this account.
   */
  allowTopup?: boolean | null;
}

export const recordToTopup = (record: TopupRecord, account: Account, transfer: Transfer | null, user: User): Topup => {
  return {
    id: record.id,
    status: record.status as TopupStatus,
    depositAmount: Number(record.depositAmount),
    depositCurrency: record.depositCurrency as DepositCurrency,
    receiveAmount: Number(record.receiveAmount),
    paymentProvider: record.paymentProvider as TopupPaymentProvider,
    paymentData: record.paymentData as unknown as MolliePaymentData ?? null,
    meta: record.meta as TopupMeta ?? null,
    account,
    transfer,
    user,
    created: record.created,
    updated: record.updated,
  } 
}