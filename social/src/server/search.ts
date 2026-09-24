import { Prisma } from '../generated/prisma/client'
import { sqlOr } from './query'

export type SearchSource = Prisma.Sql | Prisma.Sql[]

export type TrigramSearch = {
  where: Prisma.Sql
  sort: Prisma.Sql
}

const sqlGreatest = (clauses: Prisma.Sql[]): Prisma.Sql => {
  if (clauses.length === 0) {
    throw new Error('Expected at least one trigram sort clause')
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return Prisma.sql`GREATEST(${Prisma.join(clauses, ', ')})`
}

export const normalizeSearchInput = (value: string | string[] | undefined): string | undefined => {
  const raw = Array.isArray(value) ? value.join(' ') : value
  if (!raw) {
    return undefined
  }

  const normalized = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized.length > 0 ? normalized : undefined
}

export const buildTrigramSearch = (
  searchSource: SearchSource,
  queryText: string | string[] | undefined,
): TrigramSearch | null => {
  const query = normalizeSearchInput(queryText)
  if (!query) {
    return null
  }

  const searchColumns = Array.isArray(searchSource) ? searchSource : [searchSource]
  const where = searchColumns.map((searchColumn) => Prisma.sql`${searchColumn} %> ${query}`)
  const sort = searchColumns.map((searchColumn) => Prisma.sql`word_similarity(${query}, ${searchColumn})`)

  return {
    where: sqlOr(where),
    sort: sqlGreatest(sort)
  }
}