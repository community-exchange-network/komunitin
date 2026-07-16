import { Request } from "express"
import { z } from 'zod'
import { badRequest } from '../utils/error'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200
const CODE_PARAM_REGEX = /^[A-Za-z0-9._-]{1,31}$/

export type GeoPoint = {
  latitude: number
  longitude: number
}

export type PaginationOptions = {
  cursor: number
  size: number
}

export type FilterOptions = Partial<Record<string, string[]>>

export type SortOptions = {
  field: string
  order: 'asc' | 'desc'
  isDefault?: boolean
}

export type CollectionParams = {
  pagination: PaginationOptions
  filters: FilterOptions
  sort: SortOptions[]
  include: string[]
  near?: GeoPoint
}

export type CollectionParamsOptions = {
  filter?: string[]
  sort: string[]
  include?: string[]
  near?: boolean
}

export type ResourceParams = {
  include: string[]
}

export type ResourceParamsOptions = {
  include?: string[]
}

// qs splits commas before URL decoding, so URLSearchParams values need normalization after parsing.
const splitCommaSeparated = (value: unknown) => typeof value === 'string' ? value.split(',') : value

const includeParamSchema = (include: string[]) => {
  return z.preprocess(splitCommaSeparated, z.array(z.enum(include))).default([])
}

const pageParamSchema = z.object({
  size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  after: z.coerce.number().int().min(0).default(0),
}).strict().prefault({}).transform(({ after, size }) => ({
  cursor: after,
  size,
}));

const filterParamSchema = (fields: string[]) => {
  const valueSchema = z.preprocess(
    splitCommaSeparated,
    z.array(z.string())
  )
  return z.partialRecord(z.enum(fields), valueSchema)
    .default({})
    .transform((filter): FilterOptions => {
      const normalized: FilterOptions = {}
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined) {
          normalized[key] = value
        }
      }

      return normalized
    })
}

const sortParamSchema = (fields: string[]) => {
  return z.preprocess(splitCommaSeparated, z.array(z.string())
    .transform((arr) => arr.map((item) => {
      const desc = item.startsWith('-')
      const field = desc ? item.slice(1) : item
      return { field, order: desc ? 'desc' as const : 'asc' as const, isDefault: false }
    })).refine((arr) => arr.every((item) => fields.includes(item.field)), {
      message: `Sort fields must be one of: ${fields.join(', ')}`
    })).default([{
      field: fields[0],
      order: 'asc',
      isDefault: true,
    }])
}

const nearParamSchema = z.preprocess(
  splitCommaSeparated,
  z.array(z.coerce.number()).length(2).refine(([longitude, latitude]) => longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90, {
    message: 'Invalid near parameter. Longitude must be between -180 and 180, and latitude must be between -90 and 90.'
  }).transform(([longitude, latitude]) => ({ latitude, longitude }))
).optional()

const collectionParamsSchema = (options: CollectionParamsOptions) => { 
  return z.object({
    page: pageParamSchema,
    filter: filterParamSchema(options.filter ?? []),
    sort: sortParamSchema(options.sort),
    include: includeParamSchema(options.include ?? []),
    near: nearParamSchema,
  }).strict().refine((data) => !(data.sort.some((s) => s.field === 'distance') && !data.near), {
    message: 'Sorting by distance requires the "near" parameter to be provided.'
  }).transform(({page, filter, sort, include, near}) => ({
    pagination: page,
    filters: filter,
    sort,
    include,
    near
  }))
}

const resourceParamsSchema = (options: ResourceParamsOptions) => {
  return z.object({
    include: includeParamSchema(options.include ?? []),
  }).strict()
}

const idParamSchema = z.uuid()
const codeParamSchema = z.string().regex(CODE_PARAM_REGEX, {
  message: 'Code must contain only letters, numbers, dots, underscores or hyphens, and be at most 31 characters long.'
})

const parseRouteParam = (name: string, value: string, schema: z.ZodType<string>): string => {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw badRequest(`Invalid route parameter: ${name}`, { details: result.error.issues })
  }

  return result.data
}

const getParam = (req: Request, name: string): string => {
  const value = req.params[name]
  const param = Array.isArray(value) ? value[0] : value
  if (!param) {
    throw new Error(`Missing route param: ${name}`)
  }

  return param
}

export const getIdParam = (req: Request, name: string): string => {
  return parseRouteParam(name, getParam(req, name), idParamSchema)
}

export const getCode = (req: Request): string => {
  return parseRouteParam('code', getParam(req, 'code'), codeParamSchema)
}

export const getCollectionParams = (req: Request, options: CollectionParamsOptions): CollectionParams => {
  const result = collectionParamsSchema(options).safeParse(req.query)
  if (!result.success) {
    throw badRequest('Invalid query parameters', { details: result.error.issues })
  }

  return result.data
}

export const getResourceParams = (req: Request, options: ResourceParamsOptions): ResourceParams => {
  const result = resourceParamsSchema(options).safeParse(req.query)
  if (!result.success) {
    throw badRequest('Invalid query parameters', { details: result.error.issues })
  }

  return result.data
  
}
