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

/** Compute visible published offer and need counts for members or categories. */
export const findPostRelationshipCounts = async (
  ctx: OptionalAuthContext,
  db: DbClient,
  group: Group,
  relatedBy: 'memberId' | 'categoryId',
  ids: string[],
): Promise<Map<string, PostRelationshipMeta>> => {
  const uniqueIds = [...new Set(ids)]
  const counts = new Map(uniqueIds.map((id) => [id, { offers: 0, needs: 0 }]))
  if (uniqueIds.length === 0) {
    return counts
  }

  const readableWhere = await buildReadablePostWhere(ctx, group)
  if (readableWhere === null) {
    return counts
  }

  const relatedId = postColumn(relatedBy)
  const rows = await db.$queryRaw<PostRelationshipCountRow[]>(Prisma.sql`
    SELECT ${relatedId} AS "relatedId",
      ${postColumn('type')} AS "type", COUNT(*)::integer AS "count"
    FROM ${postWithMemberFrom}
    WHERE ${readableWhere}
      AND ${postColumn('status')} = 'published'
      AND ${relatedId} IN (${Prisma.join(uniqueIds)})
    GROUP BY ${relatedId}, ${postColumn('type')}
  `)

  for (const row of rows) {
    counts.get(row.relatedId)![row.type] = row.count
  }

  return counts
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
