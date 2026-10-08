import { type Migration as MigrationRecord, type Prisma } from "@prisma/client"

export interface MigrationLogEntry {
  time: string, // ISO 8601 format
  level: "info" | "warn" | "error",
  message: string,
  step: string,
  data?: Prisma.InputJsonValue
}

export type MigrationLogger = (step: string, message: string) => Promise<void>

export const migrationStatuses = ["new", "started", "completed", "failed"] as const
export type MigrationStatus = typeof migrationStatuses[number]

/** Public progress fields shared by current CSV imports and historical migrations. */
export interface MigrationData {
  source?: unknown,
  test?: boolean,
  step?: string
}

export type ApiMigration = Omit<MigrationRecord, "data" | "log" | "tenantId"> & { data?: MigrationData | null }

/** Strip optional fields before saving a checkpoint in a Prisma JSON column. */
export const migrationJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject
