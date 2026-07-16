import { Prisma } from '../../generated/prisma/client'
import type { OptionalAuthContext } from '../../server/context'
import { DbClient } from '../../server/multitenant'
import {
  findCollectionIds,
  sqlAnd,
  sqlColumn,
  sqlOr,
  sqlTable,
  type SqlColumnMap
} from '../../server/query'
import type { CollectionParams } from '../../server/request'

const groupTable = sqlTable('Group', 'g')
const groupColumn = (column: string) => sqlColumn('g', column)

/**
 * Maps API parameters to SQL columns for filtering, sorting, and searching groups.
 */
const groupColumns: SqlColumnMap = {
  id: groupColumn('id'),
  code: groupColumn('tenantId'),
  name: groupColumn('name'),
  status: groupColumn('status'),
  access: groupColumn('access'),
  created: groupColumn('created'),
  updated: groupColumn('updated'),
}

/**
 * Check if the group is active and public.
 */
const buildPublicReadableGroupWhere = () => {
  return sqlAnd([
    Prisma.sql`${groupColumn('status')} = 'active'`,
    Prisma.sql`${groupColumn('access')} = 'public'`,
  ])
}

/**
 * Check if the user is a member of the group.
 */
const buildGroupMemberWhere = (userId: string) => {
  return Prisma.sql`
    EXISTS (
      SELECT 1
      FROM "MemberUser" mu
      INNER JOIN "Member" m
        ON m."id" = mu."memberId"
       AND m."tenantId" = mu."tenantId"
      WHERE mu."userId" = ${userId}
        AND mu."tenantId" = ${groupColumn('tenantId')}
        AND m."groupId" = ${groupColumn('id')}
        AND m."deleted" IS NULL
    )
  `
}

/**
 * Check if the user is an admin of the group.
 */
const buildGroupAdminWhere = (userId: string) => {
  return Prisma.sql`
    EXISTS (
      SELECT 1
      FROM "GroupAdminUser" gau
      WHERE gau."userId" = ${userId}
        AND gau."tenantId" = ${groupColumn('tenantId')}
        AND gau."groupId" = ${groupColumn('id')}
    )
  `
}

/**
 * Build SQL WHERE clauses to filter groups based on read permissions for the given user.
 */
const buildReadableGroupWhere = (ctx: OptionalAuthContext): Prisma.Sql => {
  if (ctx.isSuperadmin || ctx.canReadAllSocial) {
    return Prisma.sql`TRUE`
  }

  const readable = [buildPublicReadableGroupWhere()]

  if (ctx.userId) {
    readable.push(buildGroupMemberWhere(ctx.userId))
    readable.push(buildGroupAdminWhere(ctx.userId))
  }

  return sqlOr(readable)
}

/**
 * Build SQL query to list groups, taking into account the user's permissions and the provided 
 * collection parameters for filtering, sorting, and pagination.
 */
export const findGroupIds = async (ctx: OptionalAuthContext, db: DbClient, params: CollectionParams): Promise<string[]> => {
  return findCollectionIds(db, {
    from: groupTable,
    columns: groupColumns,
    location: groupColumn('location'),
    search: groupColumn('search'),
    params,
    where: [
      Prisma.sql`${groupColumn('deleted')} IS NULL`,
      buildReadableGroupWhere(ctx),
    ],
  })
}
