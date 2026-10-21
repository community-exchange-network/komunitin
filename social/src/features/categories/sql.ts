import { Prisma } from '../../generated/prisma/client'
import { DbClient } from '../../server/multitenant'
import {
  type CollectionIds,
  findCollectionIds,
  sqlColumn,
  sqlTable,
  type SqlColumnMap
} from '../../server/query'
import type { CollectionParams } from '../../server/request'

const categoryTable = sqlTable('Category', 'c')
const categoryColumn = (column: string) => sqlColumn('c', column)

const categoryColumns: SqlColumnMap = {
  id: categoryColumn('id'),
  code: categoryColumn('code'),
  name: categoryColumn('name'),
  created: categoryColumn('created'),
  updated: categoryColumn('updated'),
}

export const findCategoriesIds = async (db: DbClient, params: CollectionParams): Promise<CollectionIds> => {
  return await findCollectionIds(db, {
    from: categoryTable,
    columns: categoryColumns,
    search: categoryColumn('search'),
    params,
    where: [
      Prisma.sql`${categoryColumn('deleted')} IS NULL`,
    ],
  })
}
