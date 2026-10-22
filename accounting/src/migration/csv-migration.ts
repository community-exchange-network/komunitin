import type { CurrencyControllerImpl } from '../controller/currency-controller'
import pg from 'pg'
import { badRequest, KError } from '../utils/error'
import { logger } from '../utils/logger'
import { bundleFingerprint, parseAccountingBundle, resolveBundle, type AccountingBundle, type ResolvedBundle } from './bundle'
import { MigrationController } from './migration-controller'
import { migrationJson, type ApiMigration, type MigrationLogEntry } from './migration'
import { loadKeys, hasStellarKeys, prepareKeys, storeAccountKeys, type MigrationKeys } from './keys'
import { reconcileAccounts } from './ledger'
import { reconcileExistingCurrency, validateNewCurrency } from './currency'
import { importCurrency } from './records'

// The persisted shape is shared by fresh runs and retries. New currencies always need a key checkpoint.
type CsvCheckpoint = { fingerprint: string, bundle: ResolvedBundle, step: string } & (
  | { existing: false, keys: MigrationKeys }
  | { existing: true, keys?: MigrationKeys }
)

export class CsvMigrationController {
  constructor(private readonly migrations: MigrationController) {}

  private async prepareCheckpoint(bundle: AccountingBundle, fingerprint: string): Promise<CsvCheckpoint> {
    const service = this.migrations.controller
    const db = service.tenantDb(bundle.currency.code)
    const existing = await db.currency.findUnique({ where: { code: bundle.currency.code } })
    const progress = { fingerprint, step: 'validate' }
    let checkpoint: CsvCheckpoint
    if (existing) {
      const resolved = await reconcileExistingCurrency(service, bundle)
      const reuseLedger = hasStellarKeys(resolved)
      if (reuseLedger && resolved.accounts.some(account => account.balance === undefined)) {
        throw badRequest('Reusing Stellar keys with existing accounting records requires complete balances and history')
      }
      const prepared = reuseLedger ? await prepareKeys(service, resolved) : { bundle: resolved }
      checkpoint = { ...progress, existing: true, ...prepared }
    } else {
      const resolved = resolveBundle(bundle)
      validateNewCurrency(resolved)
      const privilegedDb = service.privilegedDb()
      const accountCollisions = await privilegedDb.account.count({
        where: { id: { in: resolved.accounts.map(account => account.id) } },
      })
      const currencyCollision = await privilegedDb.currency.findUnique({ where: { id: resolved.currency.id } })
      if (accountCollisions || currencyCollision) {
        throw badRequest('Supplied UUID belongs to another accounting resource')
      }
      checkpoint = { ...progress, existing: false, ...await prepareKeys(service, resolved) }
    }
    return checkpoint
  }

  private async prepare(bundle: AccountingBundle) {
    const fingerprint = bundleFingerprint(bundle)
    const code = bundle.currency.code
    const db = this.migrations.controller.tenantDb(code)
    const previous = await db.migration.findFirst({
      where: { kind: 'csv-accounting' },
      orderBy: { created: 'desc' },
    })
    if (previous) {
      const checkpoint = previous.data as unknown as CsvCheckpoint
      if (checkpoint.fingerprint === fingerprint) {
        return previous
      }
      if (previous.status !== 'completed') {
        throw badRequest('This community already has an unfinished CSV migration with different input; restore the original bundle or resolve the migration manually')
      }
    }
    const checkpoint = await this.prepareCheckpoint(bundle, fingerprint)
    return db.migration.create({
      data: { code, name: `CSV ${code} migration`, kind: 'csv-accounting', status: 'new', data: migrationJson(checkpoint) },
    })
  }

  /** Execute under a session lock with no job-duration limit; progress belongs to the caller. */
  async execute(input: unknown, accepted: (id: string) => void, progress: (entry: MigrationLogEntry) => void) {
    const bundle = parseAccountingBundle(input)
    const lock = new pg.Client({ connectionString: process.env.DATABASE_URL, keepAlive: true, connectionTimeoutMillis: 10_000 })
    let lockLost = false
    lock.on('error', () => { lockLost = true })
    const assertActive = () => {
      if (lockLost) throw badRequest('Lost migration database lock; re-upload after restoring the database connection')
    }
    try {
      await lock.connect()
      const result = await lock.query('SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked', ['accounting-migration-run', bundle.currency.code])
      if (!result.rows[0].locked) throw badRequest('This community already has a running accounting migration; retry after it finishes')
      const migration = await this.prepare(bundle)
      assertActive()
      accepted(migration.id)
      const status = await this.run(migration, progress, assertActive)
      return { id: migration.id, status }
    } finally {
      await lock.end().catch(() => undefined)
    }
  }

  private async run(migration: Pick<ApiMigration, 'id' | 'code'>, progress: (entry: MigrationLogEntry) => void, assertActive: () => void) {
    const service = this.migrations.controller
    const current = await service.tenantDb(migration.code).migration.findUniqueOrThrow({ where: { id: migration.id } })
    const emit = (level: MigrationLogEntry['level'], step: string, message: string) => {
      progress({ time: new Date().toISOString(), level, step, message })
    }
    if (current.status === 'completed') {
      emit('info', 'complete', 'Accounting migration already completed')
      return 'completed' as const
    }
    const data = current.data as unknown as CsvCheckpoint
    const log = async (step: string, message: string) => {
      assertActive()
      await this.migrations.updateMigrationData(migration.id, { step })
      emit('info', step, message)
    }
    let status: 'completed' | 'failed' = 'completed'
    try {
      assertActive()
      await this.migrations.setMigrationStatus(migration.id, 'started')
      await log('start', 'Importing accounting CSV bundle')
      if (!data.existing) {
        await importCurrency(service, migration, data.bundle, data.keys, log)
      } else if (data.keys) {
        const controller = await service.getCurrencyController(migration.code) as CurrencyControllerImpl
        const keys = await loadKeys(service, migration.code, data.keys)
        await storeAccountKeys(controller, keys)
        await reconcileAccounts(controller, data.bundle, log)
      }
      // Existing references without supplied keys require validation only; their records stay untouched.
      await log('complete', data.existing
        ? 'Existing accounting records reconciled; values and history preserved'
        : 'Accounting CSV migration completed')
    } catch (error) {
      logger.error({ migrationId: migration.id, error }, 'Accounting migration failed')
      emit('error', 'failed', error instanceof KError
        ? error.message : 'Accounting migration failed; check service logs and re-upload to resume')
      status = 'failed'
    }
    assertActive()
    await this.migrations.setMigrationStatus(migration.id, status)
    return status
  }
}
