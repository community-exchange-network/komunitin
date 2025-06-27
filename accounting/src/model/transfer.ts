import { AtLeast } from "src/utils/types"
import { FullAccount, Account, AccountRecord, recordToAccount } from "./account"
import { Transfer as TransferRecord, ExternalTransfer as ExternalTransferRecord } from "@prisma/client"
import { Currency, User } from "."
import { ExternalResource, ExternalResourceRecord, recordToExternalResource, RelatedResource } from "./resource"
import { Prisma } from "@prisma/client";
import { internalError } from "../utils/error"

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

export type anyJson = string | number | boolean | null | undefined | { [key: string]: anyJson } | anyJson[]
export type TransferMeta = {
  description: string
  creditCommons?: {
    payeeAddress?: string
  },
  [key: string]: anyJson
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
  meta: TransferMeta

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


const metaJson = (meta: Prisma.JsonValue) : TransferMeta => {
  if (typeof meta === "object" && !Array.isArray(meta) && meta && typeof meta.description === "string") {
    return {
      ...meta,
      description: meta.description,
    }
  }
  throw internalError("Invalid meta format from database", {
    details: meta
  })
}
export const recordToTransfer = (record: TransferRecord, accounts: {
  payer: FullAccount, 
  payee: FullAccount,
  externalPayer?: ExternalResource<FullAccount>,
  externalPayee?: ExternalResource<FullAccount>
}): FullTransfer => ({
  id: record.id,
  state: record.state as TransferState,
  amount: Number(record.amount),
  meta: metaJson(record.meta),
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