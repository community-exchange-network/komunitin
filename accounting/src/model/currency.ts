
import { LedgerCurrencyState } from "../ledger";
import { AtLeast, Optional, Rate } from "../utils/types";
import { Currency as CurrencyRecord, Prisma } from "@prisma/client"
import { User } from "./user";
import { FullAccount, AccountRecord, recordToAccount } from "./account";


export { CurrencyRecord }

export type CurrencySettings = {
  /**
   * Same id as Currency.
   */
  id?: string
  /**
   * The credit limit that will have new accounts by default.
   */
  defaultInitialCreditLimit: number
  /**
   * The maximum balance that will have new accounts by default. Set
   * to undefined for no limit.
   */
  defaultInitialMaximumBalance?: number | false
  /**
   * Users can make payments by default.
   */
  defaultAllowPayments?: boolean
  /**
   * Users can make payment requests by default.
   */
  defaultAllowPaymentRequests?: boolean
  /**
   * Users need to accept payments by default (false) or they are charged automatically (true)
   */
  defaultAcceptPaymentsAutomatically?: boolean
  /**
   * List of payee account id's that can get payments without manual acceptance
   */
  defaultAcceptPaymentsWhitelist?: string[]
  
  /**
   * These are user interface settings without effect in this service.
   */
  defaultAllowSimplePayments?: boolean
  defaultAllowSimplePaymentRequests?: boolean
  defaultAllowQrPayments?: boolean
  defaultAllowQrPaymentRequests?: boolean
  defaultAllowMultiplePayments?: boolean
  defaultAllowMultiplePaymentRequests?: boolean
  
  /**
   * Default allow accounts to have authorization tags.
   */
  defaultAllowTagPayments?: boolean;
   /**
    * Default allow accounts to make payment request authorized with tags.
    */
  defaultAllowTagPaymentRequests?: boolean;
  /**
   * Number of seconds after which payments are accepted automatically
   */
  defaultAcceptPaymentsAfter?: number | false
  /**
   * If set, the dynamic on-payment credit limit scheme will be activated. Then, the
   * value of this field is the hard credit limit.
   */
  defaultOnPaymentCreditLimit?: number | false
  /**
   * Users can make external payments by default.
   */
  defaultAllowExternalPayments?: boolean
  /**
   * Users can make external payment requests by default.
   */
  defaultAllowExternalPaymentRequests?: boolean
  /**
   * Default accept external payments automatically
   */
  defaultAcceptExternalPaymentsAutomatically?: boolean
  /**
   * Whether this currency supports Komunitin external payments.
   */
  enableExternalPayments?: boolean
  /**
   * Whether this currency supports Komunitin external payment requests.
   */
  enableExternalPaymentRequests?: boolean
  /**
   * Whether this currency supports creating and receiving payments through Credit Commons protocol.
   */
  enableCreditCommonsPayments?: boolean
  /**
   * The credit limit in local currency that the external trader account will have.
   */
  externalTraderCreditLimit: number
  /**
   * The maximum balance in local currency that the external trader account may have.
   */
  externalTraderMaximumBalance?: number | false
  /**
   * Whether to hide other's account balances by default.
   */
  defaultHideBalance?: boolean
}

export type UpdateCurrencySettings = AtLeast<CurrencySettings, "id">

export type CurrencyStatus = "new" | "active"

/**
 * Currency model
 */
export interface Currency {
  id: string
  code: string
  status: CurrencyStatus
    
  name: string
  namePlural: string
    
  symbol: string
  decimals: number
  scale: number
  rate: Rate

  encryptionKey: string

  keys: {
    issuer: string
    credit: string
    admin: string
    externalTrader: string
    externalIssuer: string
    disabledAccountsPool?: string
  }

  externalAccount: FullAccount

  settings: CurrencySettings
  state: LedgerCurrencyState

  created: Date
  updated: Date

  admin: User
}

export type CreateCurrency = Optional<
  Pick<Currency, "id" | "code" | "name" | "namePlural" | "symbol" | "decimals" | "scale" | "rate"  | "created" | "updated">, 
  "id" | "created" | "updated" > 
  & { admins?: User[], settings: Partial<CurrencySettings> }
export type UpdateCurrency = Partial<CreateCurrency>

export function currencyToRecord(currency: CreateCurrency): Prisma.CurrencyCreateInput
export function currencyToRecord(currency: UpdateCurrency): Prisma.CurrencyUpdateInput
export function currencyToRecord(currency: CreateCurrency | UpdateCurrency): Prisma.CurrencyCreateInput | Prisma.CurrencyUpdateInput {
  return {
    id: currency.id,
    code: currency.code,

    name: currency.name,
    namePlural: currency.namePlural,
    symbol: currency.symbol,
    decimals: currency.decimals,
    scale: currency.scale,
    rateN: currency.rate?.n,
    rateD: currency.rate?.d,

    settings: currency.settings,
  }
}

export const recordToCurrency = (record: CurrencyRecord & {externalAccount?: AccountRecord | null }): Currency => {
  const currency = {
    id: record.id,
    code: record.code,
    status: record.status as Currency["status"],

    name: record.name,
    namePlural: record.namePlural,
    symbol: record.symbol,
    decimals: record.decimals,
    scale: record.scale,
    rate: { n: record.rateN, d: record.rateD },
    
    encryptionKey: record.encryptionKeyId,
    keys: {
      issuer: record.issuerKeyId as string,
      credit: record.creditKeyId as string,
      admin: record.adminKeyId as string,
      externalTrader: record.externalTraderKeyId as string,
      externalIssuer: record.externalIssuerKeyId as string,
      disabledAccountsPool: record.disabledAccountsPoolKeyId ?? undefined,
    },
    
    settings: {
      id: record.id,
      ...record.settings as CurrencySettings,
    },
    state: record.state as LedgerCurrencyState,
    
    created: record.created,
    updated: record.updated,

    admin: {
      id: record.adminId
    },
  } as Currency
  
  if (record.externalAccount) {
    currency.externalAccount = recordToAccount(record.externalAccount, currency)
  }
  return currency
}