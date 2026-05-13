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
const memberTable = sqlTable('Member', 'm')
const memberColumn = (column: string) => sqlColumn('m', column)

const searchablePostFrom = Prisma.sql`
  ${postTable}
  INNER JOIN ${memberTable}
    ON ${memberColumn('id')} = ${postColumn('memberId')}
   AND ${memberColumn('tenantId')} = ${postColumn('tenantId')}
`

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

  const hasSearch = params.filters.search !== undefined

  return await findCollectionIds(db, {
    from: hasSearch ? searchablePostFrom : postTable,
    columns: postColumns,
    search: hasSearch ? [postColumn('search'), memberColumn('search')] : postColumn('search'),
    params,
    where: [
      Prisma.sql`${postColumn('deleted')} IS NULL`,
      readableWhere,
    ],
  })
}
