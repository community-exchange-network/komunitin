import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { config } from '../config'

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

export default prisma
