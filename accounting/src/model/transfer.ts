import { AtLeast } from "src/utils/types"
import { FullAccount, Account, AccountRecord, recordToAccount } from "./account"
import { Transfer as TransferRecord, ExternalTransfer as ExternalTransferRecord } from "@prisma/client"
import { Currency, User } from "."
import { ExternalResource, ExternalResourceRecord, recordToExternalResource, RelatedResource } from "./resource"

export { TransferRecord }

export type TransferRecordWithAccounts = TransferRecord & {
  payer: AccountRecord,
  payee: AccountRecord,
  externalTransfer?: ExternalTransferRecord & {
    externalPayer?: ExternalResourceRecord | null,
    externalPayee?: ExternalResourceRecord | null
  } | null
}

/**
 * Possible state transitions for a transfer.
 * 
 * new ?-> pending | submitted
 * pending ?-> accepted | rejected
 * rejected ?-> deleted
 * submitted -> committed | failed
 * failed ?-> deleted
 */
export const TransferStates = ["new", "pending", "rejected", "submitted", "failed", "committed", "deleted"] as const

export type TransferState = typeof TransferStates[number]

export type TransferAuthorization = {
  type: "tag",
  // Value only presentin initial call.
  value?: string
  // Hash present in response.
  hash?: string
}

/**
 * Transfer object as returned by the API, with some fields omitted due to access permissions.
 */
export type Transfer = Omit<FullTransfer, "payer" | "payee"> & {payer: Account, payee: Account}

/**
 * This is the internal transfer object with all fields filled.
 */
export interface FullTransfer {
  id: string

  state: TransferState
  amount: number
  meta: string

  hash?: string

  created: Date
  updated: Date

  authorization?: TransferAuthorization
  
  payer: FullAccount
  payee: FullAccount

  externalPayer?: ExternalResource<FullAccount>
  externalPayee?: ExternalResource<FullAccount>

  user: User
}

export type InputTransfer = AtLeast<Omit<FullTransfer, "created" | "updated" | "payer" | "payee">, "amount" | "meta" | "state"> & {payer: RelatedResource, payee: RelatedResource}
export type UpdateTransfer = AtLeast<Omit<FullTransfer, "created" | "updated" | "payer" | "payee"> & {payer: RelatedResource, payee: RelatedResource}, "id">

export const recordToTransfer = (record: TransferRecord, accounts: {
  payer: FullAccount, 
  payee: FullAccount,
  externalPayer?: ExternalResource<FullAccount>,
  externalPayee?: ExternalResource<FullAccount>
}): FullTransfer => ({
  id: record.id,
  state: record.state as TransferState,
  amount: Number(record.amount),
  meta: record.meta,
  hash: record.hash ?? undefined,
  authorization: record.authorization as TransferAuthorization ?? undefined,
  created: record.created,
  updated: record.updated,
  payer: accounts.payer,
  payee: accounts.payee,
  externalPayer: accounts.externalPayer,
  externalPayee: accounts.externalPayee,
  user: {id: record.userId}
})

export const recordToTransferWithAccounts = (record: TransferRecordWithAccounts, currency: Currency) => 
  recordToTransfer(record, {
    payer: recordToAccount(record.payer, currency),
    payee: recordToAccount(record.payee, currency),
    externalPayer: record.externalTransfer?.externalPayer 
      ? recordToExternalResource(record.externalTransfer.externalPayer) : undefined,
    externalPayee: record.externalTransfer?.externalPayee 
      ? recordToExternalResource(record.externalTransfer.externalPayee) : undefined
  })