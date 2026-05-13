import { Prisma } from '../generated/prisma/client'
import type { CollectionParams, FilterOptions, SortOptions } from './request'
import { buildTrigramSearch } from './search'

export type SqlColumnMap = {
  id: Prisma.Sql,
  search: Prisma.Sql,
  [key: string]: Prisma.Sql
}

export type CollectionIdRow = {
  id: string
}

type CollectionIdQueryInput = {
  from: Prisma.Sql,
  columns: SqlColumnMap,
  params: CollectionParams,
  where?: Prisma.Sql[],
}

const quoteIdentifier = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

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

/**
 * Build SQL WHERE clauses from filter options. 
 * 
 * If a filter value is array or comma-separated string, it will be treated as an "IN" condition.
 * Otherwise, it will be treated as an equality condition.
 */
export const buildFilterWhere = (filter: FilterOptions, columns: SqlColumnMap): Prisma.Sql[] => {
  const where: Prisma.Sql[] = []

  for (const [key, rawValue] of Object.entries(filter)) {
    const column = columns[key]
    if (!column) {
      continue
    }

    const values = Array.isArray(rawValue) ? rawValue : rawValue.split(',')
    const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0)

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
export const buildOrderBy = (sort: SortOptions[], columns: SqlColumnMap) => {
  const dir = (order: 'asc' | 'desc') => {
    return order === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC')
  }
  
  const orderBy = sort.map((sortOption) =>
    Prisma.sql`${columns[sortOption.field]} ${dir(sortOption.order)}`
  )

  return Prisma.join(orderBy, ', ')
}

/**
 * Build a full SQL query that selects IDs from SQL fragments for filtering, sorting, and pagination.
 */
export const buildCollectionIdQuery = ({
  from,
  columns,
  params,
  where
}: CollectionIdQueryInput): Prisma.Sql => {
  // sort
  let orderBy = buildOrderBy(params.sort, columns)

  if (where === undefined) {
    where = []
  }
  const { search: query, ...filters } = params.filters
  where.push(...buildFilterWhere(filters, columns))

  // search
  if (query) {
    const trigramSearch = buildTrigramSearch(columns.search, query)
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


/**
 * To be deleted after completing the migration to raw SQL for collections.
 */
export const whereFilter = (filter: FilterOptions) => {
  const where: Record<string, any> = {}

  for (const [key, rawValue] of Object.entries(filter)) {
    const values = Array.isArray(rawValue) ? rawValue : rawValue.split(',')
    const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0)

    if (cleaned.length === 0) {
      continue
    }

    if (cleaned.length > 1) {
      where[key] = { in: cleaned }
    } else {
      where[key] = cleaned[0]
    }
  }

  return where
}

/**
 * To be deleted after completing the migration to raw SQL for collections.
 */
export const orderBySort = (sort: SortOptions[]) => {
  return sort.reduce((acc, sortOption) => {
    acc[sortOption.field] = sortOption.order
    return acc
  }, {} as Record<string, SortOptions['order']>)
}
