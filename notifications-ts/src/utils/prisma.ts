import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { setTimeout } from 'node:timers/promises'
import logger from './logger'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: [
    {
      emit: 'stdout',
      level: 'error',
    },
    {
      emit: 'stdout',
      level: 'info',
    },
    {
      emit: 'stdout',
      level: 'warn',
    },
  ],
});

/** Wait for the application's schema before starting HTTP and background workers. */
export async function waitForPrisma() {
  while (true) {
    try {
      await prisma.appNotification.findFirst({ select: { id: true } })
      return
    } catch (err) {
      logger.warn({ err }, 'Waiting for database, retrying in 1 second')
      await setTimeout(1000)
    }
  }
}

export default prisma;
