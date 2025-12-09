import { Prisma, PrismaClient } from "@prisma/client";
import { sleep } from "../utils/sleep";
import { logger } from "../utils/logger";

export type PrivilegedPrismaClient = ReturnType<typeof privilegedDb>
export type TenantPrismaClient = ReturnType<typeof tenantDb>

export const GLOBAL_TENANT_ID = "GLOBAL"

export function privilegedDb(prisma: PrismaClient) {
  return prisma.$extends(bypassRLS())
}

export function tenantDb(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends(forTenant(tenantId))
}

export function globalTenantDb(prisma: PrismaClient) {
  return tenantDb(prisma, GLOBAL_TENANT_ID)
}

function bypassRLS() {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      query: {
        $allOperations: async ({ args, query }) => {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    })
  );
}

function forTenant(tenantId: string) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      query: {
        // Set the varaible "app.current_tenant_id" in every query
        $allOperations: async ({ args, query }) => {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
      client: {
        // Make the tenantId easily available for the client.
        tenantId: tenantId
      }
    })
  );
}

export const waitForDb = async (db: PrismaClient): Promise<void> => {
  try {
    // Do a simple query to check if the DB is ready.
    await db.value.findFirst()
  } catch (error) {
    logger.info(`Waiting for DB...`)
    await sleep(1000)
    return waitForDb(db)
  }
}

export const nullToPrismaDBNull = <T extends Record<string, unknown>>(obj: T) => {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => 
      [key, value === null ? Prisma.DbNull : value]
    )
  )
}
 

/** 
 * Convert bigints to numbers in values of this map. Not recursive.
 * */
/*function bigIntsToNumbers(obj: Record<string, any>) {
  for (const key in obj) {
    if (typeof obj[key] === "bigint") {
      obj[key] = Number(obj[key]);
    } 
  }
  return obj;
}*/
/*
// Workaround for the issue https://github.com/prisma/prisma/issues/7570.
// Concretely, Prisma's schema "Int" data type is not sufficient for amount fields 
// (MAX = 2^31): balance, credit limit, etc, but JS "Number" is (MAX = 2^53).
// We could use JS BigInt, but at this point we are using the workaround of 
// converting bigints to numbers which should be fine except for the performance penalty.
function fixBigInts() {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      query: {
        $allOperations: async ({ args, query }) => {
          const result = await query(args);
          return bigIntsToNumbers(result);
        }
      }
    })
  );
}*/