import { Prisma } from '../generated/prisma/client'
import { DbClient } from './multitenant'
import { type CollectionParams, type FilterOptions, type GeoPoint, type SortOptions } from './request'
import { buildTrigramSearch, type SearchSource } from './search'

export type SqlColumnMap = {
  id: Prisma.Sql,
  [key: string]: Prisma.Sql
}

type CollectionIdRow = {
  id: string
}

type CollectionQueryInput = {
  from: Prisma.Sql,
  columns: SqlColumnMap,
  location?: Prisma.Sql,
  search?: SearchSource,
  params: CollectionParams,
  where?: Prisma.Sql[],
}

const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

export const getFilterValues = (rawValue: FilterOptions[string] | undefined): string[] => {
  return (rawValue ?? []).map((value) => value.trim()).filter((value) => value.length > 0)
}

const sqlIdentifier = (...parts: string[]): Prisma.Sql => {
  return Prisma.raw(parts.map(quoteIdentifier).join('.'))
}

/**
 * Join multiple SQL clauses with "AND".
 */
export const sqlAnd = (clauses: Prisma.Sql[]): Prisma.Sql => {
  if (clauses.length === 0) {
    return Prisma.sql`TRUE`
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return Prisma.sql`(${Prisma.join(clauses, ' AND ')})`
}

/**
 * Join multiple SQL clauses with "OR".
 */
export const sqlOr = (clauses: Prisma.Sql[]): Prisma.Sql => {
  if (clauses.length === 0) {
    return Prisma.sql`FALSE`
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return Prisma.sql`(${Prisma.join(clauses, ' OR ')})`
}

/**
 * Build "tableName AS alias" SQL fragment.
 */
export const sqlTable = (name: string, alias: string): Prisma.Sql => {
  return Prisma.raw(`${quoteIdentifier(name)} AS ${quoteIdentifier(alias)}`)
}

/**
 * Build "alias.columnName" SQL fragment.
 */
export const sqlColumn = (tableAlias: string, column: string): Prisma.Sql => {
  return sqlIdentifier(tableAlias, column)
}

const sqlGeoPoint = (point: GeoPoint): Prisma.Sql => {
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${point.longitude}, ${point.latitude}), 4326)::geography`
}

const sqlDistance = (location: Prisma.Sql, point: GeoPoint): Prisma.Sql => {
  return Prisma.sql`ST_Distance(${location}, ${sqlGeoPoint(point)})`
}


/**
 * Build SQL WHERE clauses from filter options. 
 * 
 * If a filter value is an array, it will be treated as an "IN" condition.
 * Otherwise, it will be treated as an equality condition.
 */
const buildFilterWhere = (filter: FilterOptions, columns: SqlColumnMap): Prisma.Sql[] => {
  const where: Prisma.Sql[] = []

  for (const [key, rawValue] of Object.entries(filter)) {
    const column = columns[key]
    if (!column) {
      continue
    }

    const cleaned = getFilterValues(rawValue)

    if (cleaned.length === 0) {
      continue
    }

    if (cleaned.length > 1) {
      where.push(Prisma.sql`${column} IN (${Prisma.join(cleaned)})`)
    } else {
      where.push(Prisma.sql`${column} = ${cleaned[0]}`)
    }
  }

  return where
}

/**
 * Build SQL ORDER BY clause from sort options (excluding the "ORDER BY" keyword).
 */
const buildOrderBy = (sort: SortOptions[], columns: SqlColumnMap, near?: GeoPoint, location?: Prisma.Sql) => {
  const dir = (order: 'asc' | 'desc') => {
    return order === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC')
  }
  
  const orderBy: Prisma.Sql[] = []
  
  for (const sortOption of sort) {
    if (location && near && sortOption.field === 'distance') {
      const sortExpression = sqlDistance(location, near)
      orderBy.push(Prisma.sql`${sortExpression} ${dir(sortOption.order)} NULLS LAST`)
    } else {
      orderBy.push(Prisma.sql`${columns[sortOption.field]} ${dir(sortOption.order)}`)
    }
  }

  return Prisma.join(orderBy, ', ')
}

/**
 * Build a full SQL query that selects IDs from SQL fragments for filtering, sorting, and pagination.
 */
const buildCollectionIdQuery = ({
  from,
  columns,
  location,
  search,
  params,
  where
}: CollectionQueryInput): Prisma.Sql => {
  // sort
  let orderBy = buildOrderBy(params.sort, columns, params.near, location)

  if (where === undefined) {
    where = []
  }
  const { search: query, ...filters } = params.filters
  where.push(...buildFilterWhere(filters, columns))

  // search
  if (query && search) {
    const trigramSearch = buildTrigramSearch(search, query)
    if (trigramSearch) {
      where.push(trigramSearch.where)
      if (params.sort[0]?.isDefault) {
        orderBy = trigramSearch.sort
      }
    }
  }

  const whereClause = where.length > 0
    ? Prisma.sql`WHERE ${sqlAnd(where)}`
    : Prisma.sql``
  

  // pagination
  const skip = params.pagination.cursor
  const take = params.pagination.size

  return Prisma.sql`
    SELECT ${columns.id} AS "id"
    FROM ${from}
    ${whereClause}
    ORDER BY ${orderBy}
    OFFSET ${skip}
    LIMIT ${take}
  `
}

/**
 * 
 * @param db 
 * @param input 
 * @returns 
 */
export const findCollectionIds = async (db: DbClient, input: CollectionQueryInput): Promise<string[]> => {
  const idQuery = buildCollectionIdQuery(input)
  const rows = await db.$queryRaw<CollectionIdRow[]>(idQuery)
  
  if (rows.length === 0) {
    return []
  }
  const ids = rows.map(({ id }) => id)
  return ids
}

/**
 * Reorder an array of rows based on the order of their IDs in the provided list.
 * 
 * Use this function after hydrating rows from the database to ensure the order matches 
 * the original list of IDs.
 */
export const reorderByIds = <Row extends { id: string }>(rows: Row[], ids: string[]): Row[] => {
  const rowsById = new Map(rows.map((row) => [row.id, row]))

  return ids
    .map((id) => rowsById.get(id))
    .filter((row): row is Row => row !== undefined)
}
