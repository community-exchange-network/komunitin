
import TsJapi, { type Dictionary } from "ts-japi"
import { config } from "../config"
import { CollectionParams, PaginationOptions } from "./request"

const { Linker, Paginator } = TsJapi

const getPaginationLinks = (url: string, pagination: PaginationOptions, resultLength: number, totalCount?: number) => {
  const base = new URL(url, config.API_BASE_URL)
  
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

export const getResourceLink = (type: "groups" | "members" | "offers" | "needs" | "categories" | "files" | "group-settings", code: string, id: string) => {
  const tenantBase = new URL(`${config.API_BASE_URL}/${code}`)
  switch (type) {
    case 'groups':
      return `${tenantBase}`
    case 'group-settings':
      return `${tenantBase}/settings`
    case 'members':
      return `${tenantBase}/members/${id}`
    case 'offers':
    case 'needs':
      return `${tenantBase}/posts/${id}`
    case 'categories':
      return `${tenantBase}/categories/${id}`
    case 'files':
      return `${tenantBase}/files/${id}`
  }
}

/**
 * @param url Use Request.url here to generate correct pagination links.
 */
export const getCollectionSerializerOptions = <T extends Dictionary<any>>(url:string, collectionOptions: CollectionParams, resultLength: number, totalCount?: number): SerializerOptions<T> => {
  const paginationLinks = getPaginationLinks(url, collectionOptions.pagination, resultLength, totalCount)
  return {  
    linkers: {
      paginator: new Paginator(() => paginationLinks),
      document: new Linker(() => paginationLinks.self)
    },
    include: collectionOptions.include
  }
}

export type SerializerOptions<T extends Dictionary<any>> = Partial<TsJapi.SerializerOptions<T>>