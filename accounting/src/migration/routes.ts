import { Router, json, type RequestHandler } from 'express'
import { anyAuth, Scope, userAuth } from '../server/auth'
import { asyncHandler } from '../server/handlers'
import type { BaseService } from '../controller'
import { MigrationController } from './migration-controller'
import { MigrationSerializer } from './serialize'
import { context } from '../utils/context'
import { CsvMigrationController } from './csv-migration'
import { forbidden } from '../utils/error'

const requireSocialService: RequestHandler = (req, res, next) => {
  const payload = req.auth?.payload
  const isSocialService = payload?.sub === 'komunitin-social' && payload.client_id === 'komunitin-social'
  next(isSocialService ? undefined : forbidden('Only the Social service may import accounting CSVs'))
}

export function getRoutes(controller: BaseService) {
  const migrations = new MigrationController(controller)
  const csv = new CsvMigrationController(migrations)
  const router = Router()
  const serviceRead = Router().use(userAuth(Scope.AccountingRead), requireSocialService)
  const readMigration = anyAuth(userAuth(Scope.Superadmin), serviceRead)

  // Authenticate before parsing large uploads. CSV execution belongs exclusively to this feature.
  router.post('/migrations', userAuth(Scope.AccountingWrite), requireSocialService,
    json({ type: 'application/vnd.komunitin.migration+json', limit: '110mb' }),
    asyncHandler(async (req, res) => {
      let heartbeat: ReturnType<typeof setInterval> | undefined
      const write = (event: string, data: unknown) => {
        if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
      try {
        const result = await csv.execute(req.body, id => {
          if (!res.destroyed) {
            res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Migration-Id': id })
            res.flushHeaders()
            write('migration', { id })
            heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 30_000)
            res.once('close', () => clearInterval(heartbeat))
          }
        }, entry => write('progress', entry))
        write('end', result)
        res.end()
      } catch (error) {
        if (res.headersSent) res.destroy(error as Error)
        else throw error
      } finally {
        clearInterval(heartbeat)
      }
    })
  )

  router.get('/migrations', userAuth(Scope.Superadmin), asyncHandler(async (req, res) => {
    const records = await migrations.getMigrations(context(req))
    res.json(await MigrationSerializer.serialize(records))
  }))

  // Historical migrations share the same read API; there is no legacy execution path.
  router.get('/migrations/:id', readMigration, asyncHandler(async (req, res) => {
    const migration = await migrations.getMigration(context(req), req.params.id)
    const logs = await migrations.getMigrationLogs(context(req), migration.id)
    res.json({ ...await MigrationSerializer.serialize(migration), meta: { logs } })
  }))

  return router
}
