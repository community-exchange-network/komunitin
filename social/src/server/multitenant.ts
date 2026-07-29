import { Prisma, type PrismaClient } from '../generated/prisma/client'

export type PrivilegedDbClient = ReturnType<typeof privilegedDb>
export type TenantDbClient = ReturnType<typeof tenantDb>
export type DbClient = PrivilegedDbClient | TenantDbClient

export function privilegedDb(prisma: PrismaClient) {
  return prisma.$extends(bypassRLS())
}

export function tenantDb(prisma: PrismaClient, tenantId: string) {
  return prisma.$extends(forTenant(tenantId))
}

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
        transaction: ((...args: Parameters<PrismaClient['$transaction']>) => {
          const rlsQuery = Prisma.sql`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`
          const [arg, options] = args as [any, any]

          if (Array.isArray(arg)) {
            return prisma.$transaction([prisma.$executeRaw(rlsQuery), ...arg], options)
          }

          return prisma.$transaction(async (tx) => {
            await tx.$executeRaw(rlsQuery)
            return arg(tx)
          }, options)
        }) as PrismaClient['$transaction'],
      }
    })
  )
}
