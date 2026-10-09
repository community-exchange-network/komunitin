import { z } from 'zod'
import { config } from '../../config'
import { getSocialServiceToken } from '../../clients/auth'
import { privilegedDb } from '../../server/multitenant'
import prisma from '../../utils/prisma'
import { CSV_HEADERS, encodeCsv } from './bundle/csv'
import type { MigrationImportPlan } from './bundle'
import { matchingRecord, MigrationConflict, type IdentifiedMigrationPlan, type MigrationLog } from './types'

/** Reuse global Social UUIDs before Auth resolves or creates identities. */
export const resolveSocialIdentities = async (plan: MigrationImportPlan) => {
  const db = privilegedDb(prisma)
  for (const user of plan.users) {
    const candidates = await db.user.findMany({
      where: {
        OR: [{ email: user.email }, ...(user.id ? [{ id: user.id }] : [])],
      },
    })
    const existing = matchingRecord(
      `User ${user.email}`, user.id, candidates,
      candidate => candidate.email === user.email,
    )
    if (existing) user.id = existing.id
  }
}

const responseSchema = z.object({
  users: z.array(z.object({ id: z.uuid(), email: z.string(), created: z.boolean() })),
  warnings: z.array(z.string()),
})

/** Auth establishes the canonical identities used by all later import stages. */
export const importIdentities = async (
  plan: MigrationImportPlan,
  log: MigrationLog,
): Promise<IdentifiedMigrationPlan> => {
  const headers = CSV_HEADERS['users.csv']
  const rows = plan.users.map(user => headers.map(header => user[header as keyof typeof user] ?? ''))
  const csv = encodeCsv([headers, ...rows])
  const response = await fetch(new URL('/migrations/users', config.AUTH_URL), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getSocialServiceToken()}`,
      'Content-Type': 'text/csv',
    },
    body: new Uint8Array(csv),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { errors?: { detail?: string }[] } | undefined
    throw new MigrationConflict(`Auth import: ${body?.errors?.[0]?.detail ?? `HTTP ${response.status}`}`)
  }
  const result = responseSchema.parse(await response.json())
  const users = new Map(result.users.map(user => [user.email, user]))
  if (users.size !== plan.users.length) throw new MigrationConflict('Auth returned an incomplete identity mapping')
  const identifiedUsers = plan.users.map(source => {
    const user = users.get(source.email)
    if (!user || (source.id && source.id !== user.id)) {
      throw new MigrationConflict(`Auth UUID mismatch for ${source.email}`)
    }
    return { ...source, id: user.id }
  })
  for (const warning of result.warnings) await log('warn', 'auth', warning)
  await log('info', 'auth', 'Identities imported', {
    created: result.users.filter(user => user.created).length,
    reused: result.users.filter(user => !user.created).length,
  })
  return { ...plan, users: identifiedUsers }
}
