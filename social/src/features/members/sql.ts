import { Prisma } from '../../generated/prisma/client'
import { OptionalAuthContext } from '../../server/context'
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
import { isGroupAdmin, isGroupMember } from '../groups/service'
import { Group } from '../groups/types'

const memberTable = sqlTable('Member', 'm')
const memberColumn = (column: string) => sqlColumn('m', column)

const memberColumns: SqlColumnMap = {
  id: memberColumn('id'),
  code: memberColumn('code'),
  name: memberColumn('name'),
  type: memberColumn('type'),
  status: memberColumn('status'),
  access: memberColumn('access'),
  account: memberColumn('accountId'),
  created: memberColumn('created'),
  updated: memberColumn('updated'),
}

const buildReadableMemberWhere = async (ctx: OptionalAuthContext, group: Group): Promise<Prisma.Sql | null> => {
  // Superadmins can read all members
  if (ctx.isSuperadmin || ctx.canReadAllSocial) {
    return Prisma.sql`TRUE`
  }
  // Group admins can read all members of their group
  const groupAdmin = await isGroupAdmin(ctx, group)
  if (groupAdmin) {
    return Prisma.sql`TRUE`
  }

  const readable: Prisma.Sql[] = []

  // Regular group members can read active members of their group, with access level 'public' or 'group'
  const groupMember = await isGroupMember(ctx, group)
  if (group.status === 'active') {
    readable.push(sqlAnd([
      Prisma.sql`${memberColumn('status')} = 'active'`,
      groupMember
        ? Prisma.sql`${memberColumn('access')} IN ('public', 'group')`
        : Prisma.sql`${memberColumn('access')} = 'public'`,
    ]))
  }

  // If the user is authenticated, they can read members they are directly related to, regardless of 
  // status or access level
  if (ctx.userId) {
    readable.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "MemberUser" mu
        WHERE mu."memberId" = ${memberColumn('id')}
          AND mu."tenantId" = ${memberColumn('tenantId')}
          AND mu."userId" = ${ctx.userId}
      )
    `)
  }

  if (readable.length === 0) {
    return null
  }

  return sqlOr(readable)
}

export const findMemberIds = async (
  ctx: OptionalAuthContext,
  db: DbClient,
  group: Group,
  params: CollectionParams,
): Promise<string[]> => {
  const readableWhere = await buildReadableMemberWhere(ctx, group)
  if (readableWhere === null) {
    return []
  }
  return await findCollectionIds(db, {
    from: memberTable,
    columns: memberColumns,
    location: memberColumn('location'),
    search: memberColumn('search'),
    params,
    where: [
      Prisma.sql`${memberColumn('deleted')} IS NULL`,
      readableWhere
    ],
  })
}
