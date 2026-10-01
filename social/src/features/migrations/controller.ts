import type { Request, Response } from 'express'
import { once } from 'node:events'
import { setTimeout } from 'node:timers/promises'
import { z } from 'zod'
import { getAuthContext } from '../../server/context'
import { badRequest, notFound } from '../../utils/error'
import prisma from '../../utils/prisma'
import { startMigration } from './service'
import { saveBundle } from './upload'

const migrationId = (req: Request) => {
  const result = z.uuid().safeParse(req.params.id)
  if (!result.success) throw badRequest('Invalid migration UUID')
  return result.data
}
const findMigration = async (id: string) => {
  const migration = await prisma.migration.findUnique({ where: { id } })
  if (!migration) throw notFound('Migration not found')
  return migration
}

/** Replay persisted events, so observers and workers may run on different service instances. */
const streamEvents = async (req: Request, res: Response, id: string, after = 0) => {
  const abort = new AbortController()
  res.once('close', () => abort.abort())
  if (res.destroyed) abort.abort()
  res.status(200).set({
    'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no', 'X-Migration-Id': id, Location: `/migrations/${id}`,
  })
  res.flushHeaders()
  const write = async (value: string) => {
    if (abort.signal.aborted) throw abort.signal.reason
    if (!res.write(value)) await once(res, 'drain', { signal: abort.signal })
  }
  try {
    await write(`event: migration\ndata: ${JSON.stringify({ id })}\n\n`)
    let heartbeat = Date.now()
    while (!abort.signal.aborted) {
      // Read status before events to avoid dropping the last event when completion races a poll.
      const migration = await findMigration(id)
      const events = await prisma.migrationEvent.findMany({
        where: { migrationId: id, id: { gt: after } }, orderBy: { id: 'asc' }, take: 200,
      })
      for (const event of events) {
        await write(`id: ${event.id}\nevent: progress\ndata: ${JSON.stringify(event)}\n\n`)
        after = event.id
      }
      if (migration.status !== 'running' && events.length < 200) {
        await write(`event: end\ndata: ${JSON.stringify({ id, status: migration.status })}\n\n`)
        break
      }
      if (Date.now() - heartbeat >= 15_000) {
        await write(': heartbeat\n\n')
        heartbeat = Date.now()
      }
      if (events.length < 200) await setTimeout(300, undefined, { signal: abort.signal })
    }
  } catch (error) {
    if (!abort.signal.aborted) res.destroy(error as Error)
  } finally {
    res.end()
  }
}

export const createMigration = async (req: Request, res: Response) => {
  const staged = await saveBundle(req)
  const migration = await startMigration(getAuthContext(req).userId, staged)
  await streamEvents(req, res, migration.id)
}
export const getMigration = async (req: Request, res: Response) => {
  res.type('application/json').json(await findMigration(migrationId(req)))
}
export const listMigrations = async (_req: Request, res: Response) => {
  res.type('application/json').json(await prisma.migration.findMany({ orderBy: { created: 'desc' }, take: 100 }))
}
export const migrationEvents = async (req: Request, res: Response) => {
  const id = migrationId(req)
  await findMigration(id)
  const raw = req.query.after ?? req.get('Last-Event-ID') ?? '0'
  if (typeof raw !== 'string' || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw badRequest('Invalid event cursor')
  await streamEvents(req, res, id, Number(raw))
}
