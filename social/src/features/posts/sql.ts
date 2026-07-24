import { Prisma } from '../../generated/prisma/client'
import { OptionalAuthContext } from '../../server/context'
import { DbClient } from '../../server/multitenant'
import {
  type CollectionIds,
  findCollectionIds,
  getFilterValues,
  sqlAnd,
  sqlColumn,
  sqlOr,
  sqlTable,
  type SqlColumnMap
} from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { isGroupAdmin, isGroupMember } from '../groups/service'
import { Group } from '../groups/types'
import type { PostRelationshipMeta } from './types'

const postTable = sqlTable('Post', 'p')
const postColumn = (column: string) => sqlColumn('p', column)
const memberTable = sqlTable('Member', 'm')
const memberColumn = (column: string) => sqlColumn('m', column)

const postWithMemberFrom = Prisma.sql`
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
  const live = [
    Prisma.sql`${postColumn('deleted')} IS NULL`,
    Prisma.sql`${memberColumn('deleted')} IS NULL`,
  ]

  if (ctx.isSuperadmin || ctx.canReadAllSocial || isGroupAdmin(ctx, group)) {
    return sqlAnd(live)
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

  return sqlAnd([...live, sqlOr(readable)])
}

const buildExpiredWhere = (rawValue: CollectionParams['filters'][string] | undefined): Prisma.Sql | null => {
  const values = new Set(getFilterValues(rawValue))
  const includeExpired = values.has('true')
  const includeCurrent = values.has('false')

  if (includeExpired === includeCurrent) {
    return null
  }

  return includeExpired
    ? Prisma.sql`${postColumn('expires')} < NOW()`
    : Prisma.sql`(${postColumn('expires')} IS NULL OR ${postColumn('expires')} >= NOW())`
}

type PostRelationshipCountRow = {
  relatedId: string
  type: 'offers' | 'needs'
  count: number
}

/**
 * Computes the number of published offers and needs for the given members and categories in parallel,
 * taking into account the read permissions of the user.
 */
export const findPostRelationshipCounts = async (
  ctx: OptionalAuthContext,
  db: DbClient,
  group: Group,
  targets: { memberIds?: string[]; categoryIds?: string[] },
): Promise<{ members: Map<string, PostRelationshipMeta>; categories: Map<string, PostRelationshipMeta> }> => {
  const memberIds = [...new Set(targets.memberIds ?? [])]
  const categoryIds = [...new Set(targets.categoryIds ?? [])]
  const members = new Map(memberIds.map((id) => [id, { offers: 0, needs: 0 }]))
  const categories = new Map(categoryIds.map((id) => [id, { offers: 0, needs: 0 }]))

  const readableWhere = await buildReadablePostWhere(ctx, group)
  if (readableWhere === null) {
    return { members, categories }
  }

  const commonWhere = sqlAnd([
    readableWhere,
    Prisma.sql`${postColumn('status')} = 'published'`,
  ])

  const queryCounts = async (relatedId: Prisma.Sql, ids: string[]): Promise<PostRelationshipCountRow[]> =>
    ids.length === 0
      ? []
      : db.$queryRaw(Prisma.sql`
          SELECT ${relatedId} AS "relatedId",
            ${postColumn('type')} AS "type", COUNT(*)::integer AS "count"
          FROM ${postWithMemberFrom}
          WHERE ${commonWhere} AND ${relatedId} IN (${Prisma.join(ids)})
          GROUP BY ${relatedId}, ${postColumn('type')}
        `)

  const [memberRows, categoryRows] = await Promise.all([
    queryCounts(postColumn('memberId'), memberIds),
    queryCounts(postColumn('categoryId'), categoryIds),
  ])

  for (const [rows, targets] of [[memberRows, members], [categoryRows, categories]] as const) {
    for (const row of rows) {
      targets.get(row.relatedId)![row.type] = row.count
    }
  }

  return { members, categories }
}

export const findPostsIds = async (ctx: OptionalAuthContext, db: DbClient, group: Group, params: CollectionParams): Promise<CollectionIds> => {
  const readableWhere = await buildReadablePostWhere(ctx, group)
  if (readableWhere === null) {
    return { ids: [], total: 0 }
  }

  const hasSearch = params.filters.search !== undefined
  const { expired, ...filters } = params.filters
  const expiredWhere = buildExpiredWhere(expired)

  return await findCollectionIds(db, {
    from: postWithMemberFrom,
    columns: postColumns,
    location: postColumn('location'),
    search: hasSearch ? [postColumn('search'), memberColumn('search')] : postColumn('search'),
    params: {
      ...params,
      filters,
    },
    where: [
      readableWhere,
      ...(expiredWhere ? [expiredWhere] : []),
    ],
  })
}
