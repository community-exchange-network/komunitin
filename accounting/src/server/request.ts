import {Request} from "express"
import { badRequest, internalError } from "src/utils/error"

// We use the the classic limit-offset pagination. This is the strategy that 
// offers more flexibility since we can order the dataset by any field. The
// parameters are page[size] and page[after].

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

export const pagination = (req: Request) => {
  let size = DEFAULT_PAGE_SIZE
  let cursor = 0

  const page = req.query.page as any
  if (page) {
    // Parse size
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
  return {cursor, size}
}

export const filters = (req: Request, fields: string[]) => {
  const filter = {} as Record<string, string | string[]>
  if (req.query.filter) {
    const queryFilters = req.query.filter as Record<string, string | string[]>
    for (const field of fields) {
      const value = queryFilters[field]
      // Remove unexpected field types.
      if (typeof value === "string" || (Array.isArray(value) && value.every(v => typeof v === "string"))) {
        filter[field] = value as string | string[]
      }
    }
  }
  
  return filter
}

export type Sort = {
  field: string
  order: "asc" | "desc"
}

export const sort = (req: Request, fields: string[], defaultDesc = false): SortOptions => {
  if (fields.length === 0) {
    throw internalError("Provide at least one sort field")
  }

  const sort = req.query.sort
  if (typeof sort === "string") {
    const desc = sort.startsWith("-")
    const field = desc ? sort.slice(1) : sort
    if (fields.includes(field)) {
      return {
        field,
        order: desc ? "desc" : "asc"
      }
    }
  }
  return {
    field: fields[0],
    order: defaultDesc ? "desc" : "asc"
  }
}

export const include = (req: Request, relationships: string[]) => {
  const include: string[] = []
  if (typeof req.query.include == 'string') {
    include.push(...(req.query.include.split(",")))
  } else if (Array.isArray(req.query.include)) {
    include.push(...(req.query.include as string[]))
  }
  return relationships.filter(r => include.includes(r))
}
export type PaginationOptions = {
  cursor: number
  size: number
}
export type FilterOptions = Record<string, string | string[]>
export type SortOptions = Sort

export type ResourceOptions = {
  include: string[]
}
export type CollectionOptions = {
  pagination: PaginationOptions
  filters: FilterOptions
  sort: SortOptions
  include: string[],
}
export type CollectionParamsOptions = {
  filter?: string[],
  sort: string[],
  include?: string[]
}
export type StatsOptions = {
  from: Date|undefined
  to: Date|undefined
  interval: "PT1H" | "P1D" | "P1W" | "P1M" | "P1Y" | undefined
}
export type AccountStatsOptions = StatsOptions & {
  minTransactions: number|undefined
  maxTransactions: number|undefined
}
/**
 * Return the request pagination, filtering and sort parameters. 
 * 
 * The first field in sort will be the default sort if none is provided.
 * 
 * Example:
 * ```typescript
 * const options = params(req, {
 *  filter: ["code", "id"],
 *  sort: ["code", "created", "updated"],
 *  include: ["accounts"]
 * })
 * 
 * @param req express Request
 * @param options the filter and sort fields to allow
 * @returns 
 */
export const collectionParams = (req: Request, options: CollectionParamsOptions): CollectionOptions => {
  return {
    pagination: pagination(req),
    filters: filters(req, options?.filter ?? []),
    sort: sort(req, options.sort),
    include: include(req, options?.include ?? [])
  }
}

export const relatedCollectionParams = (): CollectionOptions => {
  return {
    pagination: {cursor: 0, size: MAX_PAGE_SIZE},
    filters: {},
    sort: {field: "id", order: "asc"},
    include: []
  }
}
export type ResourceParamsOptions = { include?: string[] }
export const resourceParams = (req: Request, options: ResourceParamsOptions): ResourceOptions => {
  return {
    include: include(req, options?.include ?? [])
  }
}
const checkDateParam = (req: Request, paramName: string) => {
  const param = req.query[paramName]
  if (param === undefined) {
    return undefined
  } else if (typeof param === "string") {
    const date = new Date(param)
    if (!isNaN(date.getTime())) {
      return date
    }
  }
  throw badRequest(`Invalid ${paramName} parameter`)
}

const checkIntParam = (req: Request, paramName: string) => {
  const param = req.query[paramName]
  if (param === undefined) {
    return undefined
  } else if (typeof param === "string") {
    const value = parseInt(param)
    if (!isNaN(value) && value >= 0) {
      return value
    }
  }
  throw badRequest(`Invalid ${paramName} parameter`)
}

export const statsParams = (req: Request): StatsOptions => {
  const from = checkDateParam(req, "from")
  const to = checkDateParam(req, "to")

  if (req.query.interval !== undefined && (typeof req.query.interval !== "string"
    || !["PT1H", "P1D", "P1W", "P1M", "P1Y"].includes(req.query.interval)
  )) {
    throw badRequest("Invalid interval parameter")
  }
  const interval = req.query.interval as "PT1H" | "P1D" | "P1W" | "P1M" | "P1Y" | undefined
  return {from, to, interval}
}

export const accountStatsParams = (req: Request): AccountStatsOptions => {
  const params = statsParams(req)

  const minTransactions = checkIntParam(req, "minTransactions")
  const maxTransactions = checkIntParam(req, "maxTransactions")
  
  return {...params, minTransactions, maxTransactions}

}

