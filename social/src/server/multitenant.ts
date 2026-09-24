import { Prisma, type PrismaClient } from '../generated/prisma/client'

export type PrivilegedDbClient = ReturnType<typeof privilegedDb>
export type TenantDbClient = ReturnType<typeof tenantDb>
export type DbClient = PrivilegedDbClient | TenantDbClient
type RlsClient = {
  $executeRaw: PrismaClient['$executeRaw']
  $transaction: (...args: any[]) => Promise<any>
}

export function privilegedDb(prisma: PrismaClient) {
  return prisma.$extends(bypassRLS())
}

export function tenantDb(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends(forTenant(tenantId))
}

const transactionWithRls = (
  prisma: RlsClient,
  rlsQuery: Prisma.Sql,
) => ((...args: Parameters<PrismaClient['$transaction']>) => {
  const [arg, options] = args as [any, any]

  if (Array.isArray(arg)) {
    return prisma.$transaction([prisma.$executeRaw(rlsQuery), ...arg], options)
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw(rlsQuery)
    return arg(tx)
  }, options)
}) as PrismaClient['$transaction']

function bypassRLS() {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      query: {
        $allOperations: async ({ args, query }) => {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
            query(args),
          ])
          return result
        }
      },
      client: {
        transaction: transactionWithRls(
          prisma,
          Prisma.sql`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
        ),
      },
    })
  )
}

function forTenant(tenantId: string) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      query: {
        $allOperations: async ({ args, query }) => {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ])
          return result
        },
      },
      client: {
        tenantId,
        transaction: transactionWithRls(
          prisma,
          Prisma.sql`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
        ),
      }
    })
  )
}
