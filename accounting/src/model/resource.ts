import { type ExternalResource as ExternalResourceRecord } from "@prisma/client"

export type { ExternalResourceRecord }

export interface ResourceIdentifier {
  id: string
  type: string
}

export interface ExternalResourceIdentifier extends ResourceIdentifier {
  meta: {
    external: true
    href: string
  }
}

export type RelatedResource = ResourceIdentifier | ExternalResourceIdentifier

export interface ExternalResource<T> {
  id: string,
  type: string,
  href: string
  resource: T
}

export const recordToExternalResource = <T>(record: ExternalResourceRecord): ExternalResource<T> => ({
  id: record.id,
  type: record.type,
  href: record.href,
  resource: record.resource as T
})

export const externalResourceToIdentifier = (resource: ExternalResource<any>): ExternalResourceIdentifier => ({
  id: resource.id,
  type: resource.type,
  meta: {
    external: true,
    href: resource.href
  }
})
