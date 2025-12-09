import { NextFunction, Request, Response } from "express"
import { CollectionOptions, CollectionParamsOptions, ResourceOptions, ResourceParamsOptions, StatsOptions, accountStatsParams, collectionParams, resourceParams, statsParams } from "./request"
import { Context, context } from "src/utils/context"
import { DataDocument, Dictionary, Linker, Paginator, Serializer } from "ts-japi"
import { input, Resource } from "./parse"
import { config } from "src/config"
import { badRequest, inactiveCurrency } from "src/utils/error"
import { format as formatcsv } from "@fast-csv/format"
import { BaseService, CurrencyService } from "../controller"

/**
 * Helper for general async route handlers
 */
export const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res)
    } catch (err) {
      next(err)
    }
  }
}

async function checkActiveCurrency(ctx: Context, currencyController: CurrencyService) {
  const currency = await currencyController.getCurrency(ctx)
  if (currency.status !== "active") {
    throw inactiveCurrency(`Currency ${currency.code} is not active`)
  }
}

export type CurrencyHandlerOptions = {
  status?: number,
  checkActive?: boolean
}

export function currencyHandler<T extends Dictionary<any>>(controller: BaseService, fn: (currencyController: CurrencyService, context: Context, req: Request) => Promise<Partial<DataDocument<T>>>, options: CurrencyHandlerOptions = {}) {
  const status = options.status ?? 200
  const checkActive = options.checkActive ?? true
  return asyncHandler(async (req, res) => {
    const ctx = context(req)
    const currencyController = await controller.getCurrencyController(req.params.code)
    if (checkActive) {
      await checkActiveCurrency(ctx, currencyController)
    }
    const response = await fn(currencyController, ctx, req)
    res.status(status).json(response)
  })
}

function paginatorHelper<T>(data: T[]|T, params: CollectionOptions, req: Request) {
  return new Paginator((data: T[]|T) => {
    if (Array.isArray(data)) {
      const changeCursor = (cursor: number| null) => {
        if (cursor === null) {
          return null
        }
        const url = new URL(req.originalUrl, config.API_BASE_URL)
        url.searchParams.set('page[after]', cursor.toString())
        return url.toString()
      }

      const next = data.length === params.pagination.size ? params.pagination.cursor + params.pagination.size : null
      const prev = params.pagination.cursor >= params.pagination.size ? params.pagination.cursor - params.pagination.size : null
      
      return {
        first: changeCursor(0),
        last: null,
        prev: changeCursor(prev),
        next: changeCursor(next),
      }
    } 
    return
  })
}


type CurrencyResourceHandler<T> = (controller: CurrencyService, context: Context, id: string, params: ResourceOptions) => Promise<T>
/**
 * Helper for route handlers that return a single resource within a currency.
 */
export function currencyResourceHandler<T extends Dictionary<any>>(controller: BaseService, fn: CurrencyResourceHandler<T>, serializer: Serializer<T>, paramOptions: ResourceParamsOptions, options: CurrencyHandlerOptions = {}) {
  return currencyHandler(controller, async (currencyController, ctx, req) => {
    const params = resourceParams(req, paramOptions)
    const resource = await fn(currencyController, ctx, req.params.id, params)
    return serializer.serialize(resource, {
      include: params.include,
      linkers: {
        resource: new Linker(() => {
          // A convenient way to solve it, but we could compute the URL from the resource as well.
          return `${config.API_BASE_URL}${req.path}`
        })
      }
    })
  }, options)
}

type CurrencyCollectionHandler<T> = (controller: CurrencyService, context: Context, params: CollectionOptions) => Promise<T[]>
/**
 * Helper for route handlers that return a collection of resources within a currency.
 */
export function currencyCollectionHandler<T extends Dictionary<any>>(controller: BaseService, fn: CurrencyCollectionHandler<T>, serializer: Serializer<T>, paramOptions: CollectionParamsOptions, options: CurrencyHandlerOptions = {}) {
  return currencyHandler(controller, async (currencyController, ctx, req) => {
    const params = collectionParams(req, paramOptions)
    const resource = await fn(currencyController, ctx, params)
    return serializer.serialize(resource, {
      include: params.include,
      linkers: {
        paginator: paginatorHelper(resource, params, req),
        resource: new Linker((resource) => {
          return `${config.API_BASE_URL}${req.path}/${resource.id}`
        })
      }
    })
  }, options)
}

export type CurrencyInputHandler<T,D> = ((controller: CurrencyService, context: Context, data: D, params: Record<string, string> ) => Promise<T>)
type CurrencyInputHandlerMultiple<T,D> = ((controller: CurrencyService, context: Context, data: D|D[]) => Promise<T|T[]>)
/**
 * Helper for route handlers that require input data.
 */
export function currencyInputHandler<T extends Dictionary<any>, D extends Resource>(controller: BaseService, fn: CurrencyInputHandler<T,D>, serializer: Serializer<T>, options: CurrencyHandlerOptions = {}) {
  return currencyHandler(controller, async (currencyController, ctx, req) => {
    const data = input<D>(req)
    if (Array.isArray(data)) {
      throw badRequest("Expected a single resource")
    }
    const resource = await fn(currencyController, ctx, data, req.params)
    return serializer.serialize(resource)
  }, options)
}

export function currencyInputHandlerMultiple<T extends Dictionary<any>, D extends Resource>(controller: BaseService, fn: CurrencyInputHandlerMultiple<T,D>, serializer: Serializer<T>, options: CurrencyHandlerOptions = {}) {
  return currencyHandler(controller, async (currencyController, ctx, req) => {
    const data = input<D>(req)
    const resource = await fn(currencyController, ctx, data)
    return serializer.serialize(resource)
  }, options)
}

/**
 * Helper for route handlers that exports a collection of resources within a currency as CSV.
 */
export function currencyCollectionCsvHandler<T>(controller: BaseService, fn: CurrencyCollectionHandler<T>, paramOptions: CollectionParamsOptions, csvMapper: (item: T) => Record<string, string|number|boolean|null>, options: CurrencyHandlerOptions = {}) {
  const status = options.status ?? 200
  const checkActive = options.checkActive ?? true
  return asyncHandler(async (req, res) => {
    const ctx = context(req)
    const currencyController = await controller.getCurrencyController(req.params.code)
    if (checkActive) {
      await checkActiveCurrency(ctx, currencyController)
    }

    const params = collectionParams(req, paramOptions)

    const csvfields = Array.isArray(req.query.csvfields) 
      ? req.query.csvfields as string[] 
      : (typeof req.query.csvfields === "string" 
        ? req.query.csvfields.split(",") 
        : null
      ) 
    
    // build filename
    const route = req.path.split("/").pop() as string
    const base = route.endsWith(".csv") ? route.slice(0, -4) : route
    const filters = Object.entries(params.filters).map(([key, value]) => `${key}-${value}`).join("_")
    const suffix = filters ? `_${filters}` : ""
    const filename = `${base}${suffix}.csv`

    res.status(status)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')

    // Create the CSV stream
    const stream = formatcsv({headers: true})
    stream.pipe(res)

    // Fetch data in batches and write to the CSV stream
    const BATCH_SIZE = 200
    params.pagination = { size: BATCH_SIZE, cursor: 0}
    let hasMore = true

    while (hasMore) {
      const data = await fn(currencyController, ctx, params)
      data.forEach(item => {
        const record = csvMapper(item)
        if (csvfields) {
          const filtered = Object.fromEntries(
            csvfields.filter(field => field in record) // Discard invalid fields
            .map(field => [field, record[field]])
          )
          stream.write(filtered)
        } else {
          stream.write(record)
        }
      })
      hasMore = data.length === BATCH_SIZE
      params.pagination.cursor += BATCH_SIZE
    }
    stream.end()
  })

}