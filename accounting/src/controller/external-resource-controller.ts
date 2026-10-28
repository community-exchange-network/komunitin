import { mount } from "../server/parse";
import { ExternalResource, ExternalResourceIdentifier, recordToExternalResource, RelatedResource } from "../model/resource";
import { Context } from "../utils/context";
import { AbstractCurrencyController } from "./abstract-currency-controller";
import { badRequest, internalError } from "../utils/error";
import { fixUrl } from "../utils/net";


export class ExternalResourceController extends AbstractCurrencyController {

  private EXTERNAL_RESOURCE_CACHE_TIME = 60 * 60 * 1000 // 1 hour

  public async getExternalResource<T extends Record<string,any>>(ctx: Context, id: ExternalResourceIdentifier): Promise<ExternalResource<T>> {
    const where = { tenantId_id: { tenantId: this.db().tenantId, id: id.id } }
    let record = await this.db().externalResource.findUnique({ where })
    // Forbid changing the type or href of an existing external resource.
    // That prevents suplanting an existing external resource
    // Eg: an existing trusted currency, an existing account in a transfer.
    if (record && (record.type !== id.type || record.href !== id.meta.href)) {
      throw badRequest("External resource UUID is already bound to a different type or URI")
    }
    if (!record || this.isExpired(record)) {
      // resource expired or not found in DB, fetch it from the external server
      const resource = await fetchExternalResource<T>(id)
      record = await this.db().externalResource.upsert({
        where: { ...where, type: id.type, href: id.meta.href },
        create: {
          tenantId: this.db().tenantId,
          id: id.id,
          type: id.type,
          href: id.meta.href,
          resource
        },
        update: { resource }
      })
    }
    return recordToExternalResource(record)
  }

  private isExpired(record: { updated: Date }) {
    return Date.now() - record.updated.getTime() > this.EXTERNAL_RESOURCE_CACHE_TIME
  }
}

export async function fetchExternalResource<T extends Record<string, any>>(resourceId: ExternalResourceIdentifier): Promise<T> {
  // External resources may be from this server or from another server. We could directly 
  // get the internal ones from the DB, but if that works as well is just more symmetric.
  const response = await fetch(fixUrl(resourceId.meta.href))
  if (!response.ok) {
    throw internalError(`Failed to fetch external resource: ${response.statusText}`)
  }
  const data = await response.json() as any
  if (data.data.id !== resourceId.id || data.data.type !== resourceId.type) {
    throw badRequest("External response does not match the requested resource identity")
  }
  const resource = mount(data.data) as T
  return resource
}

export function isExternalResourceIdentifier(resource: RelatedResource | undefined): resource is ExternalResourceIdentifier {
  return (resource !== undefined) && (resource as ExternalResourceIdentifier).meta?.external === true
}
