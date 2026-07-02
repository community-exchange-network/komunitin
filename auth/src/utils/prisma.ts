import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { config } from '../config'

const pool = new pg.Pool({ connectionString: config.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

export async function checkPrismaHealth() {
	await prisma.$queryRawUnsafe('SELECT 1')
}

export async function disconnectPrisma() {
	await prisma.$disconnect()
	await pool.end()
}

export default prisma
