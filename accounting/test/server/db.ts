import { PrismaClient } from "@prisma/client";
import { privilegedDb, tenantDb } from "src/controller/multitenant";
import { logger } from "src/utils/logger";


export const pseudoRandomGenerator = (seed: number = 12032025) => {
  // Knuth's multiplicative hash function
  // for a 32-bit integer
  const hash = (x: number) => {
    return (x * 2654435761) % 2**32
  }
  /**
   * returns a pesudo-random integer between min and max using Knuth's 
   * multiplicative hash function.
   * @param min 
   * @param max 
   */  
  return (min: number, max: number) => {
    seed = hash(seed)
    const scaled = seed / 2**32  // between 0 and 1
    return Math.floor(min + scaled * (max - min))  // between min and max
  }
}

export async function clearDb() {
  const client = privilegedDb(new PrismaClient())
  await client.$connect()
  //https://www.prisma.io/docs/orm/prisma-client/queries/crud#deleting-all-data-with-raw-sql--truncate
  const tablenames = await client.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ')

  await client.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`)
  await client.$disconnect()
  logger.info("Database cleared")
}

/**
 * Create n random account records in the DB for the given tenant. Note that this
 * function does not really create the accounts in the ledger.
 * @param tenantId 
 * @param n 
 * @param start 
 * @param end 
 */
export async function seedAccounts(tenantId: string, n: number, start: Date, end: Date) {
  const client = tenantDb(new PrismaClient(), tenantId)
  await client.$connect()

  const currency = await client.currency.findFirst()
  if (currency === null) {
    throw new Error("No currency found")
  }

  const r = pseudoRandomGenerator()
  for (let i = 0; i < n; i++) {
    const created = new Date(r(start.getTime(), end.getTime()))
    const account = await client.account.create({
      data: {
        // use TEST1000, TEST1001, not to conflict with existing accounts
        code: `${currency?.code}${1000 + i}`, 
        balance: r(0, 10000)*100,
        created,
        updated: new Date(r(created.getTime(), end.getTime())),
        creditLimit: 0,
        status: r(0, 10) > 0 ? "active" : "deleted",
        currency: { connect: { id: currency.id } },
        // Use stub key
        key: {
          create: {
            encryptedSecret: `account-secret-${i}`,
          }
        },
      }
    })
  }
}

/**
 * Creates n random local transactions between accounts of the given tenant.
 * This function directly creates the transfer records in the DB without
 * updating balances or checking conditions.
 * @param tenantId 
 * @param n 
 */
export async function seedTransfers(tenantId: string, n: number, start: Date, end: Date, userId: string) {
  const client = tenantDb(new PrismaClient(), tenantId)
  await client.$connect()
  const r = pseudoRandomGenerator()
  const accounts = await client.account.findMany()

  const chooseAccount = (start: Date, end: Date) => {
    const available = accounts.filter(a => a.created.getTime() <= end.getTime() &&
    !(a.status === "deleted" && a.updated.getTime() <= start.getTime()))
    if (available.length === 0) {
      throw new Error("No available accounts")
    }
    return available[r(0, available.length)]
  }
  
  for (let i = 0; i < n; i++) {
    const payer = chooseAccount(start, end)
    const payee = chooseAccount(
      new Date(Math.max(payer.created.getTime(), start.getTime())), 
      new Date(Math.min(end.getTime(), payer.status === "deleted" ? payer.updated.getTime() : Infinity))
    )
    
    const amount = r(10, 1000)*100
    const text = `Transaction ${i}`
    const accountsStart = Math.max(payer.created.getTime(), payee.created.getTime(), start.getTime())
    const accountsEnd = Math.min(end.getTime(), 
      payer.status == 'deleted' ? payer.updated.getTime() : Infinity, 
      payee.status == 'deleted' ? payee.updated.getTime() : Infinity)

    const created = new Date(r(accountsStart, accountsEnd))
    const transfer = await client.transfer.create({
      data: {
        amount,
        payerId: payer.id,
        payeeId: payee.id,
        meta: {
          description: text,
        },
        userId,
        state: r(0, 10) > 0 ? "committed" : "rejected",
        created,
        updated: created,
        hash: `hash-${i}`,
      }
    })
  }
}