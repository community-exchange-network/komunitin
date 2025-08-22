import { Migration as MigrationRecord } from "@prisma/client"
import { Account, AccountSettings, Currency, CurrencySettings, FullAccount, Transfer } from "../model"

export interface MigrationLogEntry {
  time: string, // ISO 8601 format
  level: "info" | "warn" | "error",
  message: string,
  step: string,
  data?: any // Optional additional data
}

export const migrationKinds = ["integralces-accounting"] as const
export type MigrationKind = typeof migrationKinds[number]

export const migrationStatuses = ["new", "started", "completed", "failed"] as const
export type MigrationStatus = typeof migrationStatuses[number]

type AccountMember = {
  state: "draft" | "pending" | "active" | "suspended" | "deleted"
  type: "personal" | "business" | "public" | "virtual"
}
export type MigrationCurrency = Pick<Currency, "id" | "code" | "name" | "namePlural" | "symbol" | "decimals" | "scale" | "rate" | "created" | "updated"> 
    & { settings: Partial<CurrencySettings>, admins: {id: string}[] }
export type MigrationAccount = (Pick<FullAccount, "id" | "code" | "status" | "balance" | "creditLimit" | "maximumBalance" | "created" | "updated"> 
    & { settings: AccountSettings, users: {id: string}[], member: AccountMember })
export type MigrationTransfer = (Pick<Transfer, "id" | "amount" | "state" | "meta" | "created" | "updated"> 
    & { payer: {id: string, code: string}, payee: {id: string, code: string}, user: { id: string }})

export interface MigrationData {
  currency?: MigrationCurrency,
  accounts?: MigrationAccount[],
  transfers?: MigrationTransfer[],
  migrationAccount?: {
    id: string,
    code: string,
    key: string,
  }
}

export type CreateMigration = Pick<Migration, "code" | "name" | "kind" | "data">

export type Migration = Omit<MigrationRecord, "data" | "log"> & {
  data: MigrationData,
  log: MigrationLogEntry[],
}

export type ApiMigration = Omit<Migration, "data" | "log">

