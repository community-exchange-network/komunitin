import { Prisma } from '../../generated/prisma/client'
import { OptionalAuthContext } from '../../server/context'
import { DbClient } from '../../server/multitenant'
import {
  findCollectionIds,
  sqlColumn,
  sqlTable,
  type SqlColumnMap
} from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { isGroupAdmin, isGroupMember } from '../groups/service'
import { Group } from '../groups/types'

const categoryTable = sqlTable('Category', 'c')
const categoryColumn = (column: string) => sqlColumn('c', column)

const categoryColumns: SqlColumnMap = {
  id: categoryColumn('id'),
  code: categoryColumn('code'),
  name: categoryColumn('name'),
  access: categoryColumn('access'),
  created: categoryColumn('created'),
  updated: categoryColumn('updated'),
}

const buildReadableCategoryWhere = async (ctx: OptionalAuthContext, group: Group) => {
  if (ctx.isSuperadmin) {
    return Prisma.sql`TRUE`
  }

  const groupAdmin = await isGroupAdmin(ctx, group)
  if (groupAdmin) {
    return Prisma.sql`TRUE`
  }

  const groupMember = await isGroupMember(ctx, group)

  if (groupMember) {
    return Prisma.sql`${categoryColumn('access')} IN ('public', 'group')`
  }

  if (group.status === 'active') {
    return Prisma.sql`${categoryColumn('access')} = 'public'`
  }

  return null
}

export const findCategoriesIds = async (ctx: OptionalAuthContext, db: DbClient, group: Group, params: CollectionParams): Promise<string[]> => {
  const readableWhere = await buildReadableCategoryWhere(ctx, group)
  if (readableWhere === null) {
    return []
  }
  return await findCollectionIds(db, {
    from: categoryTable,
    columns: categoryColumns,
    search: categoryColumn('search'),
    params,
    where: [readableWhere],
  })
}

