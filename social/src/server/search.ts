import { Prisma } from '../generated/prisma/client'

export type TrigramSearch = {
  where: Prisma.Sql
  sort: Prisma.Sql
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
  searchColumn: Prisma.Sql,
  queryText: string | string[] | undefined,
): TrigramSearch | null => {
  const query = normalizeSearchInput(queryText)
  if (!query) {
    return null
  }

  return {
    where: Prisma.sql`${searchColumn} %> ${query}`,
    sort: Prisma.sql`word_similarity(${query}, ${searchColumn})`
  }
}