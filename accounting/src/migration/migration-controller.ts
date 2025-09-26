import { Context } from "src/utils/context"
import { SharedController } from "../controller"
import { ApiMigration, CreateMigration, MigrationLogEntry, Migration, MigrationStatus, UpdateMigration } from "./migration"
import { notFound } from "../utils/error"
import { EventEmitter } from "events"
import TypedEmitter from "typed-emitter"
import { ICESMigrationController } from "./integralces-migration"

type MigrationControllerEvents = {
  logUpdate: (migrationId: string, log: MigrationLogEntry) => void
}

export class MigrationController {
  private logEmitter: TypedEmitter<MigrationControllerEvents>
  
  constructor(readonly controller: SharedController) {
    this.logEmitter = new EventEmitter() as TypedEmitter<MigrationControllerEvents>
  }

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
    }) as ApiMigration[]

    return migrations 
  }

  private async getFullMigration(id: string): Promise<Migration> {
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

    return migration as unknown as Migration
  }

  async getMigration(ctx: Context, id: string): Promise<ApiMigration> {
    // Return only the main fields and a few fields from data.
    const { data, ...migration } = await this.getFullMigration(id)
    const { step, test, source } = data || {}
    return {
      ...migration,
      data: {
        step,
        test,
        source
      }
    }
  }
  
  async createMigration(ctx: Context, migration: CreateMigration): Promise<ApiMigration> {

    // Create the migration record
    const db = this.controller.tenantDb(migration.code)
    const migrationRecord = await db.migration.create({
      data: {
        code: migration.code,
        name: migration.name,
        kind: migration.kind,
        status: "new",
        tenantId: migration.code,
        data: migration.data || {},
        log: []
      }
    })

    const response = await this.getMigration(ctx, migrationRecord.id)

    // Add initial log entry
    await this.addLogEntry(response, "info", "create", "Migration record created")

    return response
  }

  async updateMigration(ctx: Context, migration: UpdateMigration): Promise<ApiMigration> {
    if (!migration.id) {
      throw new Error("Migration id is required for update")
    }
    const db = this.controller.tenantDb(migration.code)
    const existingMigration = await db.migration.findUnique({
      where: { id: migration.id }
    })

    if (!existingMigration) {
      throw notFound(`Migration with id ${migration.id} not found`)
    }

    await db.migration.update({
      where: { id: migration.id },
      data: {
        name: migration.name,
      }
    })

    if (migration.data) {
      await this.updateMigrationData(migration.id, migration.data)
    }

    const response = await this.getMigration(ctx, migration.id)

    await this.addLogEntry(response, "info", "update", "Migration record updated")

    return response    
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

  onLogUpdate(migrationId: string, callback: (log: MigrationLogEntry) => void): () => void {
    const wrappedCallback = (id: string, log: MigrationLogEntry) => {
      if (id === migrationId) {
        callback(log)
      }
    }
    
    this.logEmitter.on('logUpdate', wrappedCallback)
    
    return () => {
      this.logEmitter.off('logUpdate', wrappedCallback)
    }
  }

  async deleteMigration(ctx: Context, id: string): Promise<void> {
    const db = this.controller.privilegedDb()
    
    // Check if migration exists first
    const migration = await db.migration.findUnique({
      where: { id },
      select: { id: true }
    })

    if (!migration) {
      throw notFound(`Migration with id ${id} not found`)
    }

    // Delete the migration
    await db.migration.delete({
      where: { id }
    })
  }

  /**
   * 
   * @param migrationId Migration id
   * @param data Data to update in the migration. It will be merged with the existing data
   * using PostgreSQL's JSONB || operator.
   */
  async updateMigrationData(migrationId: string, data: any): Promise<void> {
    const db = this.controller.privilegedDb()
    
    await db.$executeRaw`
      UPDATE "Migration" 
      SET data = data || ${JSON.stringify(data)}::jsonb
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

  public async addLogEntry(migration: ApiMigration, level: "info" | "warn" | "error", step: string, message: string, data?: any) {
    const db = this.controller.tenantDb(migration.code)
    
    const logEntry: MigrationLogEntry = {
      time: new Date().toISOString(),
      level,
      message,
      step,
      ...(data ? { data } : undefined)
    }

    // Append the log entry to the migration's log JSONB field
    await db.$executeRaw`
      UPDATE "Migration" 
      SET log = log || ${JSON.stringify([logEntry])}::jsonb
      WHERE id = ${migration.id}
    `

    // Emit the log entry for SSE streams
    this.logEmitter.emit('logUpdate', migration.id, logEntry)
  }

  /**
   * Execute migration
   * @param ctx 
   * @param id 
   */
  async playMigration(ctx: Context, id: string): Promise<void> {
    const migration = await this.getFullMigration(id)
    
    if (ICESMigrationController.isICESMigration(migration)) {
      const icesController = new ICESMigrationController(this, migration)
      await icesController.play()
    }
    
  }

}