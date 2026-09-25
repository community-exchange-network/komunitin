import prisma from '../../utils/prisma'
import { conflict, internalError } from '../../utils/error'
import { parseUsersCsv } from './schema'

/** Import identities only. Existing identities, including passwords and verification, are immutable here. */
export const importUsers = async (bytes: Buffer) => {
  const rows = parseUsersCsv(bytes)
  const users: { id: string, email: string, created: boolean }[] = []
  const warnings: string[] = []
  for (const row of rows) {
    const existing = await prisma.user.findUnique({ where: { email: row.email } })
    if (existing && row.id && existing.id !== row.id) {
      throw conflict(`User ${row.email}: supplied UUID ${row.id} conflicts with existing UUID ${existing.id}`)
    }
    if (!existing && row.id && await prisma.user.findUnique({ where: { id: row.id } })) {
      throw conflict(`User ${row.email}: UUID ${row.id} belongs to another identity`)
    }
    let user = existing
    if (!user) {
      const createdAt = new Date(row.createdAt || row.updatedAt || Date.now())
      try {
        user = await prisma.user.create({ data: {
          id: row.id || undefined,
          email: row.email,
          passwordHash: row.passwordHash,
          status: row.status || 'active',
          emailVerified: true,
          createdAt,
          updatedAt: row.updatedAt ? new Date(row.updatedAt) : createdAt,
        } })
      } catch (error) {
        // Prisma errors may contain the complete create input, including the password hash.
        if ((error as { code?: string }).code === 'P2002') {
          throw conflict(`User ${row.email}: identity was created concurrently; retry the migration`)
        }
        throw internalError(`Could not import user ${row.email}`)
      }
      if (!row.status) warnings.push(`User ${row.email}: missing status; created active`)
      if (!row.passwordHash) warnings.push(`User ${row.email}: no password; password reset required`)
    }
    users.push({ id: user.id, email: user.email, created: existing === null })
  }
  return { users, warnings }
}
