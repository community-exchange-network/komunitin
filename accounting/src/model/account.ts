import { AtLeast, Optional, WithRequired } from 'src/utils/types'
import { Currency } from './currency'
import { Account as AccountRecord, User as UserRecord, AccountTag as AccountTagRecord, Prisma } from '@prisma/client'
import { User } from './user'

export { AccountRecord }

export enum AccountStatus {
  Active = "active",
  Deleted = "deleted",
}


// Accounts, as returned by the API, do not need to have all fields filled. 
// That depends on the permissions of the caller.
export type Account = Optional<FullAccount, "balance" | "creditLimit" | "maximumBalance" | "users" | "settings">
export interface FullAccount {
  id: string, // e.g. f51d66ac-ec5f-493a-8ce8-1f815f7ff637
  code: string, // e.g. NET20002
  key: string // e.g. GDFBLI4HMOJGYJEZRKKI2LZ3MMD4KP5QAZJ2VALERKBWHO5OXBOUDD42
  status: AccountStatus

  created: Date
  updated: Date

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

  /** If defined, the credit limit for this account is increased every
  * time this account receives a payment by the same amount until the
  * limit is reached.
  * */
  onPaymentCreditLimit?: number

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
  
  /**  Tags that can be used to pre-authorize payments. */
  tags?: Tag[]

  /**
   * Whether to hide the balance of this account from other users.
   */
  hideBalance?: boolean
}

// No input needed for creating an account (beyond implicit currency)!
export type InputAccount = Partial<Pick<FullAccount, "id" | "code" | "creditLimit" | "maximumBalance" | "users">>
export type UpdateAccount = WithRequired<InputAccount, "id">

export function accountToRecord(account: UpdateAccount): Prisma.AccountUpdateInput {
  const accountRecord: Prisma.AccountUpdateInput = {
    id: account.id,
    code: account.code,
    creditLimit: account.creditLimit,
    maximumBalance: account.maximumBalance ?? null,
  }

  return accountRecord
}

type AccountRecordComplete = AccountRecord & {users?: {user: UserRecord}[], tags?: AccountTagRecord[]}

export const recordToAccount = (record: AccountRecordComplete, currency: Currency): FullAccount => {
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
    balance: Number(record.balance),
    creditLimit: Number(record.creditLimit),
    maximumBalance: record.maximumBalance ? Number(record.maximumBalance) : undefined,
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

export const userHasAccount = (user: User, account: FullAccount): boolean | undefined => {
  return account.users?.some(u => u.id === user.id)
}