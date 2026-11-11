import { PrismaClient } from '@prisma/client'
import { setTimeout } from 'node:timers/promises'
import { privilegedDb, PrivilegedPrismaClient } from '../controller/multitenant'
import { logger } from './logger'

/** Create a database client once its schema is available. */
export async function createPrisma() {
  const prisma = new PrismaClient()
  await waitForPrisma(prisma)
  return prisma
}

/** Check connectivity and access to the application's schema. */
export async function checkPrismaHealth(prisma: PrivilegedPrismaClient) {
  await prisma.value.findFirst({ select: { key: true } })
}

async function waitForPrisma(prisma: PrismaClient) {
  const db = privilegedDb(prisma)
  while (true) {
    try {
      await checkPrismaHealth(db)
      return
    } catch {
      logger.info('Waiting for database...')
      await setTimeout(1000)
    }
  }
}
