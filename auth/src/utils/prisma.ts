import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { setTimeout } from 'node:timers/promises'
import { PrismaClient } from '../generated/prisma/client'
import { config } from '../config'
import logger from './logger'

const pool = new pg.Pool({ connectionString: config.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
const DB_RETRY_INTERVAL_MS = 1000

/** Wait for the application's schema before initializing the identity provider. */
export async function waitForPrisma() {
  while (true) {
    try {
      await prisma.signingKey.findFirst({ select: { id: true } })
      return
    } catch (err) {
      logger.warn({ err }, 'Waiting for database, retrying in 1 second')
      await setTimeout(DB_RETRY_INTERVAL_MS)
    }
  }
}

export async function disconnectPrisma() {
  await prisma.$disconnect()
  await pool.end()
}

export default prisma
