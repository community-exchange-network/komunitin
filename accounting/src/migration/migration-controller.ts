import type { Context } from "../utils/context"
import type { ApiMigration, MigrationData, MigrationLogEntry, MigrationStatus } from "./migration"
import type { Prisma } from '@prisma/client'
import { notFound } from "../utils/error"
import type { BaseService } from "../controller"

/** Execution checkpoints and read API, including logs from historical migrations. */
export class MigrationController {
  constructor(readonly controller: BaseService) {}

  async getMigrations(ctx: Context): Promise<ApiMigration[]> {
    const db = this.controller.privilegedDb()
    const migrations = await db.migration.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        status: true,
        created: true,
        updated: true
      }
    })

    return migrations
  }

  async getMigration(ctx: Context, id: string): Promise<ApiMigration> {
    const db = this.controller.privilegedDb()
    const migration = await db.migration.findUnique({
      where: { id },
      omit: {
        log: true
      }
    })

    if (!migration) {
      throw notFound(`Migration with id ${id} not found`)
    }

    // Checkpoints contain the imported bundle and encrypted keys. Expose only public progress fields.
    const { data, ...record } = migration
    const { step, test, source } = (data as MigrationData | null) ?? {}
    return {
      ...record,
      data: {
        step,
        test,
        source
      }
    }
  }
  
  async getMigrationLogs(ctx: Context, id: string): Promise<MigrationLogEntry[]> {
    const db = this.controller.privilegedDb()
    const migration = await db.migration.findUnique({
      where: { id },
      select: { log: true }
    })

    if (!migration) {
      throw notFound(`Migration with id ${id} not found`)
    }

    return (migration.log as unknown as MigrationLogEntry[]) || []
  }

  /** Merge progress fields atomically without replacing the durable bundle and key checkpoint. */
  async updateMigrationData(migrationId: string, data: Prisma.InputJsonObject): Promise<void> {
    const db = this.controller.privilegedDb()
    
    await db.$executeRaw`
      UPDATE "Migration" 
      SET data = data || ${JSON.stringify(data)}::jsonb, updated = NOW()
      WHERE id = ${migrationId}
    `
  }

  async setMigrationStatus(migrationId: string, status: MigrationStatus): Promise<void> {
    const db = this.controller.privilegedDb()

    await db.migration.update({
      where: { id: migrationId },
      data: { status }
    })
  }
}
