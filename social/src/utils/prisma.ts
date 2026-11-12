import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../generated/prisma/client'
import { config } from '../config'
import { privilegedDb } from '../server/multitenant'

const adapter = new PrismaPg({ connectionString: config.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

/** Check connectivity and access to the application's schema. */
export async function checkPrismaHealth() {
  // Without tenant context, RLS would filter every user and force a full scan.
  await privilegedDb(prisma).user.findFirst({ select: { id: true } })
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
