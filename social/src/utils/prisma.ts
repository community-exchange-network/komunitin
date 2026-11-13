import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../generated/prisma/client'
import { setTimeout } from 'node:timers/promises'
import { config } from '../config'
import { privilegedDb } from '../server/multitenant'
import logger from './logger'

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

/** Wait for the application's schema before starting HTTP and background workers. */
export async function waitForPrisma() {
  const db = privilegedDb(prisma)
  while (true) {
    try {
      await db.user.findFirst({ select: { id: true } })
      return
    } catch (err) {
      logger.warn({ err }, 'Waiting for database, retrying in 1 second')
      await setTimeout(1000)
    }
  }
}

export const toNullableJsonInput = (
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) {
    return undefined
  }

  return value === null ? Prisma.DbNull : value
}

export default prisma
