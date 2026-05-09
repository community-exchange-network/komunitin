import { Request } from "express"
import { internalError } from '../utils/error'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

export type PaginationOptions = {
  cursor: number
  size: number
}

export type FilterOptions = Record<string, string | string[]>

export type SortOptions = {
  field: string
  order: 'asc' | 'desc'
}

export type CollectionParams = {
  pagination: PaginationOptions
  filters: FilterOptions
  sort: SortOptions
  include: string[]
}

export type CollectionParamsOptions = {
  filter?: string[]
  sort: string[]
  include?: string[]
}

export const getParam = (req: Request, name: string): string => {
  const value = req.params[name]
  const param = Array.isArray(value) ? value[0] : value
  if (!param) {
    throw new Error(`Missing route param: ${name}`)
  }

  return param
}

export const getCode = (req: Request): string => {
  return getParam(req, 'code')
}

export const getPagination = (req: Request): PaginationOptions => {
  let size = DEFAULT_PAGE_SIZE
  let cursor = 0

  const page = req.query.page as any
  if (page) {
    if (page.size) {
      const inputSize = parseInt(page.size)
      if (inputSize > 0 && inputSize <= MAX_PAGE_SIZE) {
        size = inputSize
      }
    }
    if (page.after) {
      const inputAfter = parseInt(page.after)
      if (inputAfter >= 0) {
        cursor = inputAfter
      }
    }
  }

  return { cursor, size }
}

export const getFilters = (req: Request, fields: string[]): FilterOptions => {
  const filter = {} as FilterOptions
  if (req.query.filter) {
    const queryFilters = req.query.filter as Record<string, string | string[]>
    for (const field of fields) {
      const value = queryFilters[field]
      if (typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'))) {
        filter[field] = value
      }
    }
  }

  return filter
}

export const getSort = (req: Request, fields: string[], defaultDesc = false): SortOptions => {
  if (fields.length === 0) {
    throw internalError('Provide at least one sort field')
  }

  const sort = req.query.sort
  if (typeof sort === 'string') {
    const desc = sort.startsWith('-')
    const field = desc ? sort.slice(1) : sort
    if (fields.includes(field)) {
      return {
        field,
        order: desc ? 'desc' : 'asc',
      }
    }
  }

  return {
    field: fields[0],
    order: defaultDesc ? 'desc' : 'asc',
  }
}

export const getInclude = (req: Request, relationships: string[]) => {
  const include: string[] = []
  if (typeof req.query.include == 'string') {
    include.push(...(req.query.include.split(",")))
  } else if (Array.isArray(req.query.include)) {
    include.push(...(req.query.include as string[]))
  }
  return relationships.filter(r => include.includes(r))
}

export const getCollectionParams = (req: Request, options: CollectionParamsOptions): CollectionParams => {
  return {
    pagination: getPagination(req),
    filters: getFilters(req, options.filter ?? []),
    sort: getSort(req, options.sort),
    include: getInclude(req, options.include ?? []),
  }
}
