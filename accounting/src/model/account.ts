import { AtLeast } from 'src/utils/types'
import { Currency } from './currency'
import { Account as AccountRecord, User as UserRecord, AccountTag as AccountTagRecord, Prisma } from '@prisma/client'
import { User } from './user'

export { AccountRecord}

export enum AccountStatus {
  Active = "active",
  Deleted = "deleted",
}

export interface Account {
  id: string,
  code: string,
  key: string
  status: AccountStatus

  created: Date
  updated: Date

  // These are calculated fields from the ledger.
  balance: number,
  creditLimit: number,
  maximumBalance?: number,

  users?: User[]
  currency: Currency
  
  settings: AccountSettings
}

export type Tag = {
  /**
   * Unique identifier for the tag.
   */
  id?: string
  /**
   * Name of the tag
   */
  name: string
  /**
   * Arbitrary unique value for the tag.
   * Only present in the request.
   */
  value?: string
  /**
   * Only present in the response.
   */
  updated?: Date
}


export type AccountSettings = {
  // Same id as the account
  id?: string

  // 1. Payment directions

  /** This account can make payments. */
  allowPayments?: boolean

  /** This account can request payments form other accounts. */
  allowPaymentRequests?: boolean

  // 2. Payment Workflows

  allowSimplePayments?: boolean,
  allowSimplePaymentRequests?: boolean,
  allowQrPayments?: boolean,
  allowQrPaymentRequests?: boolean,
  allowMultiplePayments?: boolean,
  allowMultiplePaymentRequests?: boolean

  /** Allow this account to make payments with tags.
  * Concretely, allow this account to define tags and allow other accounts
  * to pre-authorize payments using these tags. */
  allowTagPayments?: boolean

  /** Allow this account to request payments preauthorized with tags. */
  allowTagPaymentRequests?: boolean

  // 3. PR acceptance
  
  /** Payments from all accounts are automatically accepted. */ 
  acceptPaymentsAutomatically?: boolean

  /** If acceptPaymentsAutomatically is false, accept payments after this
  * period of time in seconds if no manual action is taken.
  * */
  acceptPaymentsAfter?: number

  /** 
  * If acceptPaymentsAutomatically is false, this is a list of account id's
  * for which payments are automatically accepted. Work for external accounts too.
  * */
  acceptPaymentsWhitelist?: string[]

  // 4. External Payments

  /** This account can make external payments. */ 
  allowExternalPayments?: boolean

  /** This account can request external payments. */
  allowExternalPaymentRequests?: boolean

  /**  Payments from external accounts are automatically accepted. 
  * If acceptPaymentsAutomatically is false, this is taken as false too.
  * */
  acceptExternalPaymentsAutomatically?: boolean

  // 5. Others

  /** If defined, the credit limit for this account is increased every
  * time this account receives a payment by the same amount until the
  * limit is reached.
  * */
  onPaymentCreditLimit?: number
  
  /**  Tags that can be used to pre-authorize payments. */
  tags?: Tag[]
}

// No input needed for creating an account (beyond implicit currency)!
export type InputAccount = Pick<Account, "id" | "code" | "creditLimit" | "maximumBalance" | "settings" | "users">
export type UpdateAccount = AtLeast<InputAccount, "id">

export function accountToRecord(account: UpdateAccount): Prisma.AccountUpdateInput {
  const accountRecord: Prisma.AccountUpdateInput = {
    id: account.id,
    code: account.code,
    creditLimit: account.creditLimit,
    maximumBalance: account.maximumBalance ?? null,
  }

  if (account.settings) {
    const {tags, ...settings} = account.settings
    accountRecord.settings = settings
  }

  return accountRecord
}

type AccountRecordComplete = AccountRecord & {users?: {user: UserRecord}[], tags?: AccountTagRecord[]}

export const recordToAccount = (record: AccountRecordComplete, currency: Currency): Account => {
  const users = record.users ? record.users.map(accountUser => ({id: accountUser.user.id})) : undefined;
  const tags = record.tags ? record.tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    updated: tag.updated,
  })) : undefined
  return {
    id: record.id,
    status: record.status as AccountStatus,
    code: record.code,
    key: record.keyId,
    // Ledger cache
    balance: record.balance,
    creditLimit: record.creditLimit,
    maximumBalance: record.maximumBalance ?? undefined,
    // Created and updated
    created: record.created,
    updated: record.updated,
    // Relationships
    users,
    currency,
    settings: {
      id: record.id,
      tags,
      ...(record.settings as AccountSettings)
    },
  }
}

export const userHasAccount = (user: User, account: Account): boolean | undefined => {
  return account.users?.some(u => u.id === user.id)
}