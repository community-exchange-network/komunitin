import { NextFunction, Request, Response, urlencoded } from "express"
import { CurrencyController, SharedController } from "src/controller"
import { CollectionOptions, CollectionParamsOptions, ResourceOptions, ResourceParamsOptions, collectionParams, resourceParams } from "./request"
import { Context, context } from "src/utils/context"
import { DataDocument, Dictionary, Paginator, Serializer } from "ts-japi"
import { input } from "./parse"
import { config } from "src/config"


/**
 * Helper for general async route handlers
 */
export const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req,res)
    } catch (err) {
      next(err)
    }
  }
}

function currencyHandlerHelper<T extends Dictionary<any>>(controller: SharedController, fn: (currencyController: CurrencyController, context: Context, req: Request) => Promise<Partial<DataDocument<T>>>, status = 200) {
  return asyncHandler(async (req, res) => {
    const ctx = context(req)
    const currencyController = await controller.getCurrencyController(req.params.code)
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


type CurrencyResourceHandler<T> = (controller: CurrencyController, context: Context, id: string, params: ResourceOptions) => Promise<T>
/**
 * Helper for route handlers that return a single resource within a currency.
 */
export function currencyResourceHandler<T extends Dictionary<any>>(controller: SharedController, fn: CurrencyResourceHandler<T>, serializer: Serializer<T>, paramOptions: ResourceParamsOptions, status = 200) {
  return currencyHandlerHelper(controller, async (currencyController, ctx, req) => {
    const params = resourceParams(req, paramOptions)
    const resource = await fn(currencyController, ctx, req.params.id, params)
    return serializer.serialize(resource, {
      include: params.include
    })
  })
}

type CurrencyCollectionHandler<T> = (controller: CurrencyController, context: Context, params: CollectionOptions) => Promise<T|T[]>
/**
 * Helper for route handlers that return a collection of resources within a currency.
 */
export function currencyCollectionHandler<T extends Dictionary<any>>(controller: SharedController, fn: CurrencyCollectionHandler<T>, serializer: Serializer<T>, paramOptions: CollectionParamsOptions, status = 200) {
  return currencyHandlerHelper(controller, async (currencyController, ctx, req) => {
    const params = collectionParams(req, paramOptions)
    const resource = await fn(currencyController, ctx, params)
    return serializer.serialize(resource, {
      include: params.include,
      linkers: {
        paginator: paginatorHelper(resource, params, req)
      }
    })
  })
}

type CurrencyInputHandler<T,D> = (controller: CurrencyController, context: Context, data: D) => Promise<T>
/**
 * Helper for route handlers that require input data.
 */
export function currencyInputHandler<T extends Dictionary<any>, D>(controller: SharedController, fn: CurrencyInputHandler<T,D>, serializer: Serializer<T>, status = 200) {
  return currencyHandlerHelper(controller, async (currencyController, ctx, req) => {
    const data = input(req)
    const resource = await fn(currencyController, ctx, data)
    return serializer.serialize(resource)
  })
}
