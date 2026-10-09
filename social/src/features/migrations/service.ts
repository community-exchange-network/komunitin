import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { config } from '../../config'
import prisma from '../../utils/prisma'
import logger from '../../utils/logger'
import { prepareMigrationBundle } from './bundle'
import { loadAccounting, resolveAccountingIdentities, resolveAccountingReferences, importAccounting } from './accounting'
import { importIdentities, resolveSocialIdentities } from './identities'
import { persistSocial } from './persistence'
import { importImages } from './images'
import { MigrationConflict, type MigrationLog } from './types'
import type { saveBundle } from './upload'

type StagedBundle = Awaited<ReturnType<typeof saveBundle>>

const prepareImport = async (path: string, log: MigrationLog) => {
  await log('info', 'parse', 'Validating bundle structure and Social records')
  const bytes = await readFile(path)
  const prepared = await prepareMigrationBundle({ type: 'zip', bytes })
  if (!prepared.success) {
    // Malformed values may contain credentials. Persist only diagnostic locations and codes.
    for (const error of prepared.errors) {
      await log('error', 'parse', `${error.file ?? 'bundle'}:${error.row ?? ''} ${error.code}`, {
        file: error.file,
        row: error.row,
        column: error.file === 'users.csv' ? null : error.column,
        code: error.code,
      })
    }
    throw new MigrationConflict('Bundle validation failed; correct the reported rows and re-upload')
  }
  return prepared
}

const lockCommunity = async (lock: pg.Client, code: string) => {
  await lock.connect()
  const result = await lock.query(
    'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked',
    ['social-migration', code],
  )
  if (!result.rows[0].locked) {
    throw new MigrationConflict(`Community ${code} already has a running migration`)
  }

  // Owning the session lock proves that previous workers for this community have stopped.
  const interrupted = await prisma.migration.findMany({ where: { code, status: 'running' } })
  for (const previous of interrupted) {
    await prisma.$transaction([
      prisma.migrationEvent.create({
        data: {
          migrationId: previous.id,
          level: 'error',
          step: 'interrupted',
          message: 'Previous worker stopped before completion; a new upload is resuming the community',
        },
      }),
      prisma.migration.update({
        where: { id: previous.id },
        data: { status: 'failed', finished: new Date() },
      }),
    ])
  }
}

const recordFailure = async (id: string, error: unknown) => {
  const message = error instanceof MigrationConflict
    ? error.message
    : 'Migration failed unexpectedly; check service logs, fix the cause and re-upload'

  // Never attach the plan or source CSVs: they may contain password hashes and Stellar secrets.
  logger.error({ migrationId: id, error: error instanceof Error ? error.message : 'Unknown error' }, 'Migration failed')
  await prisma.$transaction([
    prisma.migrationEvent.create({ data: { migrationId: id, level: 'error', step: 'failed', message } }),
    prisma.migration.update({ where: { id }, data: { status: 'failed', finished: new Date() } }),
  ])
}

/** Run independently of the HTTP connection; each retry is an explicit new upload. */
const execute = async (id: string, staged: StagedBundle) => {
  const lock = new pg.Client({
    connectionString: config.DATABASE_URL,
    keepAlive: true,
    connectionTimeoutMillis: 10_000,
  })
  let lockLost = false
  lock.on('error', () => { lockLost = true })
  const assertActive = () => {
    if (lockLost) {
      throw new MigrationConflict('Lost migration database lock; re-upload after restoring the database connection')
    }
  }
  const log: MigrationLog = async (level, step, message, data = {}) => {
    assertActive()
    await prisma.migrationEvent.create({ data: { migrationId: id, level, step, message, data } })
  }

  try {
    const { plan, summary, accountingFiles } = await prepareImport(staged.path, log)
    await lockCommunity(lock, plan.community.code)
    await prisma.migration.update({
      where: { id },
      data: { code: plan.community.code, data: { summary: { ...summary } } },
    })
    await log('info', 'parse', 'Bundle structure and Social records validated; Accounting validation follows', { ...summary })

    // Reuse known UUIDs before Auth assigns identities for users absent from both services.
    await resolveSocialIdentities(plan)
    const existingAccounting = await loadAccounting(plan)
    resolveAccountingIdentities(plan, existingAccounting)
    await log('info', 'auth', 'Importing users.csv into Auth')
    const identifiedPlan = await importIdentities(plan, log)

    await importAccounting(identifiedPlan, accountingFiles, log, assertActive)
    const accounting = await resolveAccountingReferences(identifiedPlan, existingAccounting, log)
    const owners = await persistSocial(id, identifiedPlan, accounting, log, assertActive)
    await importImages(id, plan.community.code, owners, log, assertActive)

    await log('info', 'complete', 'Migration completed')
    await prisma.migration.update({ where: { id }, data: { status: 'completed', finished: new Date() } })
  } catch (error) {
    await recordFailure(id, error)
  } finally {
    await lock.end().catch(() => undefined)
    await staged.remove()
  }
}

export const startMigration = async (requestedBy: string, staged: StagedBundle) => {
  let migration
  try {
    migration = await prisma.migration.create({ data: { requestedBy } })
  } catch (error) {
    await staged.remove()
    throw error
  }
  void execute(migration.id, staged).catch(() => {
    logger.error({ migrationId: migration.id }, 'Migration worker stopped; re-upload to resume')
  })
  return migration
}
