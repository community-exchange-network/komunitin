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

const postTable = sqlTable('Post', 'p')
const postColumn = (column: string) => sqlColumn('p', column)

const postColumns: SqlColumnMap = {
  id: postColumn('id'),
  code: postColumn('code'),
  type: postColumn('type'),
  status: postColumn('status'),
  access: postColumn('access'),
  member: postColumn('memberId'),
  category: postColumn('categoryId'),
  created: postColumn('created'),
  updated: postColumn('updated'),
  expires: postColumn('expires'),
  search: postColumn('search'),
}

const buildReadablePostWhere = async (ctx: OptionalAuthContext, group: Group): Promise<Prisma.Sql | null> => {
  const isAdmin = ctx.isSuperadmin || await isGroupAdmin(ctx, group)
  if (isAdmin) {
    return Prisma.sql`TRUE`
  }

  const readable: Prisma.Sql[] = []

  // Readable posts for active groups.
  if (group.status === 'active') {
    const isMember = await isGroupMember(ctx, group)
    readable.push(sqlAnd([
      Prisma.sql`${postColumn('status')} = 'published'`,
      isMember
        ? Prisma.sql`${postColumn('access')} IN ('public', 'group')`
        : Prisma.sql`${postColumn('access')} = 'public'`,
    ]))
  }

  // Own posts
  if (ctx.userId) {
    readable.push(Prisma.sql`
      EXISTS (
        SELECT 1
        FROM "MemberUser" mu
        WHERE mu."memberId" = ${postColumn('memberId')}
          AND mu."tenantId" = ${postColumn('tenantId')}
          AND mu."userId" = ${ctx.userId}
      )
    `)
  }

  if (readable.length === 0) {
    return null
  }

  return sqlOr(readable)
}


export const findPostsIds = async (ctx: OptionalAuthContext, db: DbClient, group: Group, params: CollectionParams): Promise<string[]> => {
  const readableWhere = await buildReadablePostWhere(ctx, group)
  if (readableWhere === null) {
    return []
  }
  return await findCollectionIds(db, {
    from: postTable,
    columns: postColumns,
    params,
    where: [
      Prisma.sql`${postColumn('deleted')} IS NULL`,
      readableWhere,
    ],
  })
}
