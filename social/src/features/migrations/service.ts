import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { config } from '../../config'
import prisma from '../../utils/prisma'
import logger from '../../utils/logger'
import { parseMigrationBundle } from './bundle'
import { checkAccounting } from './accounting'
import { importIdentities, resolveSocialIdentities } from './identities'
import { persistSocial } from './persistence'
import { importImages } from './images'
import { MigrationConflict, type MigrationLog } from './types'
import type { saveBundle } from './upload'

type StagedBundle = Awaited<ReturnType<typeof saveBundle>>

/** Run independently of the HTTP connection; each retry is an explicit new upload. */
const execute = async (id: string, staged: StagedBundle) => {
  const lock = new pg.Client({ connectionString: config.DATABASE_URL, keepAlive: true, connectionTimeoutMillis: 10_000 })
  let lockLost = false
  lock.on('error', () => { lockLost = true })
  const assertActive = () => {
    if (lockLost) throw new MigrationConflict('Lost migration database lock; re-upload after restoring the database connection')
  }
  const log: MigrationLog = async (level, step, message, data = {}) => {
    assertActive()
    await prisma.migrationEvent.create({ data: { migrationId: id, level, step, message, data } })
  }
  try {
    await log('info', 'parse', 'Validating uploaded CSV ZIP bundle')
    const parsed = await parseMigrationBundle({ type: 'zip', bytes: await readFile(staged.path) })
    if (!parsed.success) {
      // Parser messages may quote malformed CSV values. Locations and codes are enough to fix the input.
      for (const error of parsed.errors) {
        await log('error', 'parse', `${error.file ?? 'bundle'}:${error.row ?? ''} ${error.code}`, {
          file: error.file, row: error.row, column: error.file === 'users.csv' ? null : error.column, code: error.code,
        })
      }
      throw new MigrationConflict('Bundle validation failed; correct the reported rows and re-upload')
    }
    const { plan, summary } = parsed
    await lock.connect()
    const result = await lock.query('SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked', ['social-migration', plan.community.code])
    if (!result.rows[0].locked) throw new MigrationConflict(`Community ${plan.community.code} already has a running migration`)
    // Acquiring the session lock proves that prior running attempts for this community have stopped.
    const interrupted = await prisma.migration.findMany({ where: { code: plan.community.code, status: 'running' } })
    for (const previous of interrupted) {
      await prisma.$transaction([
        prisma.migrationEvent.create({ data: {
          migrationId: previous.id, level: 'error', step: 'interrupted',
          message: 'Previous worker stopped before completion; a new upload is resuming the community',
        } }),
        prisma.migration.update({ where: { id: previous.id }, data: { status: 'failed', finished: new Date() } }),
      ])
    }
    await prisma.migration.update({ where: { id }, data: { code: plan.community.code, data: { summary: { ...summary } } } })
    await log('info', 'parse', 'Bundle validated', { ...summary })
    await resolveSocialIdentities(plan)
    const accounting = await checkAccounting(plan, log)
    await log('info', 'auth', 'Importing users.csv into Auth')
    await importIdentities(plan, log)
    const owners = await persistSocial(id, plan, accounting, log, assertActive)
    await importImages(id, plan.community.code, owners, log, assertActive)
    await log('info', 'complete', 'Migration completed')
    await prisma.migration.update({ where: { id }, data: { status: 'completed', finished: new Date() } })
  } catch (error) {
    const message = error instanceof MigrationConflict ? error.message : 'Migration failed unexpectedly; check service logs, fix the cause and re-upload'
    // Never attach the parsed plan (which contains password hashes) to logs or records.
    logger.error({ migrationId: id, error: error instanceof Error ? error.message : 'Unknown error' }, 'Migration failed')
    await prisma.$transaction([
      prisma.migrationEvent.create({ data: { migrationId: id, level: 'error', step: 'failed', message } }),
      prisma.migration.update({ where: { id }, data: { status: 'failed', finished: new Date() } }),
    ])
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
  void execute(migration.id, staged).catch(() => logger.error({ migrationId: migration.id }, 'Migration worker stopped; re-upload to resume'))
  return migration
}
