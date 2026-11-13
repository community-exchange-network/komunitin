import { PrismaClient } from '@prisma/client'
import { setTimeout } from 'node:timers/promises'
import { privilegedDb } from '../controller/multitenant'
import { logger } from './logger'

/** Create a database client once its schema is available. */
export async function createPrisma() {
  const prisma = new PrismaClient()
  await waitForPrisma(prisma)
  return prisma
}

async function waitForPrisma(prisma: PrismaClient) {
  const db = privilegedDb(prisma)
  while (true) {
    try {
      await db.value.findFirst({ select: { key: true } })
      return
    } catch (err) {
      logger.warn({ err }, 'Waiting for database, retrying in 1 second')
      await setTimeout(1000)
    }
  }
}
