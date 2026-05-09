
import TsJapi, { type Dictionary } from "ts-japi"
import { config } from "../config"
import { CollectionParams, PaginationOptions } from "./request"

const { Linker, Paginator } = TsJapi

const getPaginationLinks = (path: string, pagination: PaginationOptions, resultLength: number, totalCount?: number) => {
  const base = new URL(path, config.API_BASE_URL)
  
  const withPagination = (cursor: number) => {
    const url = new URL(base.toString())
    url.searchParams.set('page[size]', pagination.size.toString())
    url.searchParams.set('page[after]', cursor.toString())
    return url.toString()
  }

  const first = withPagination(0)
  const prev = pagination.cursor >= pagination.size ? withPagination(pagination.cursor - pagination.size) : null
  const self = withPagination(pagination.cursor)
  const next = resultLength === pagination.size ? withPagination(pagination.cursor + pagination.size) : null
  const last = totalCount !== undefined ? withPagination(Math.floor((totalCount - 1) / pagination.size) * pagination.size) : undefined
  
  return { first, prev, self, next, last }
}


export const getCollectionSerializerOptions = <T extends Dictionary<any>>(path:string, collectionOptions: CollectionParams, resultLength: number, totalCount?: number): SerializerOptions<T> => {
  const paginationLinks = getPaginationLinks(path, collectionOptions.pagination, resultLength, totalCount)
  return {  
    linkers: {
      paginator: new Paginator(() => paginationLinks),
      document: new Linker(() => paginationLinks.self)
    },
    include: collectionOptions.include
  }
}

export type SerializerOptions<T extends Dictionary<any>> = Partial<TsJapi.SerializerOptions<T>>