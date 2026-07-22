
import TsJapi, { type Dictionary } from "ts-japi"
import { config } from "../config"
import { CollectionParams, PaginationOptions } from "./request"

const { Linker, Metaizer, Paginator, Serializer } = TsJapi

export type ExternalResource = {
  id: string
  href: string
}

const getPaginationLinks = (url: string, pagination: PaginationOptions, totalCount: number) => {
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
  const nextCursor = pagination.cursor + pagination.size
  const next = nextCursor < totalCount ? withPagination(nextCursor) : null
  const lastCursor = totalCount === 0 ? 0 : Math.floor((totalCount - 1) / pagination.size) * pagination.size
  const last = withPagination(lastCursor)
  
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
export const getCollectionSerializerOptions = <T extends Dictionary<any>>(url:string, collectionOptions: CollectionParams, totalCount: number): SerializerOptions<T> => {
  const paginationLinks = getPaginationLinks(url, collectionOptions.pagination, totalCount)
  return {  
    linkers: {
      paginator: new Paginator(() => paginationLinks),
      document: new Linker(() => paginationLinks.self)
    },
    include: collectionOptions.include,
    metaizers: {
      document: new Metaizer(() => ({ count: totalCount })),
    },
  }
}

export const externalResourceSerializer = <T extends ExternalResource>(type: string) => {
  return new Serializer<T>(type, {
    version: null,
    projection: undefined,
    metaizers: {
      resource: new Metaizer<[T]>((resource) => ({
        external: true,
        href: resource.href,
      })),
    },
  })
}

export type SerializerOptions<T extends Dictionary<any>> = Partial<TsJapi.SerializerOptions<T>>
