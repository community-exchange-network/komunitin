// Mirage typings are not perfect and sometimes we must use any.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Request } from "miragejs";
import { JSONAPISerializer } from "miragejs";
import type { ResourceIdentifierObject, ResourceObject } from "src/store/model";

declare module "miragejs/serializer" {
  interface JSONAPISerializer {
    getResourceObjectForModel(model: any): any;
    serialize(object: any, request: Request): any;
    getHashForIncludedResource(model: any): any;
    typeKeyForModel(model: any): string;
  }
}

export default class ApiSerializer extends JSONAPISerializer {
  public static readonly DEFAULT_PAGE_SIZE = 20;

  typeKeyForModel(model: any) {
    // `type` is a domain attribute on members. Mirage otherwise mistakes it
    // for the JSON:API resource type when the application serializer handles
    // a member subcollection.
    return model.modelName === "member"
      ? "members"
      : JSONAPISerializer.prototype.typeKeyForModel.call(this, model)
  }

  /**
   * Include linkage data for ro-one relationships
   */
  shouldIncludeLinkageData(relationshipKey: string, model: any) {
    return model.associations[relationshipKey].type == "belongsTo" ;
  }
  /**
   * Add meta.count field to collection relationships.
   * Add self link.
   * Add external relationship fields.
   */
  getResourceObjectForModel(model: any) {
    const json = super.getResourceObjectForModel(model);
    model.associationKeys.forEach((key: string) => {
      const relationship = model[key];
      const relationshipKey = (this as any).keyForRelationship(key);
      
      const jsonRelationship = json.relationships[relationshipKey];
      // External relationships have associations but their relationships are deleted
      // from the hash in getHashForIncludedResource(), so this variable may be undefined.
      if (jsonRelationship) {
        // Add meta.count field.
        if ((this as any).isCollection(relationship)) {
          jsonRelationship.meta = {
            count: relationship.models.length
          }
        }
      }
    });
    const serializer = (this as any).serializerFor(model.modelName);
    const url = serializer.selfLink(model);
    if (url !== undefined) {
      json.links = {
        self: serializer.selfLink(model)
      }
    }
    return json;
  }

  /**
   * Extend base function to support inclusion of external resources as defined
   * in https://github.com/komunitin/komunitin-api/blob/master/jsonapi-profiles/external.md
  */
  getHashForIncludedResource(model: any) {
    // Delete attributes and relationships for external resources, and add the "external" flag.
    const computed = super.getHashForIncludedResource(model);
    const hash = computed[0];

    if (this.isExternal(model.modelName)) {
      hash.included.forEach((resource: any) => {
        delete resource.attributes;
        delete resource.relationships;
        resource.meta = {
          external: true,
          href: resource.links.self
        };
      });
      // Also dont follow the inclusion chain, since this is external resource and 
      // therefore this server can't know about related resources of this included resource.
      computed[1] = [];
    }
    return computed;
  }
  /**
   * Returns whether the relationship identified by given key is external.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected isExternal(key: string): boolean {
    return false;
  }

  /**
   * Self link for given model. Return undefined for not setting the link.
   */
  selfLink(): string | undefined {
    return undefined;
  }
  /**
   * Apply page[x] query params.
   * 
   * @param object The serialized json object, before pagination.
   * @param request The original (fake) request object
   */
  private paginate(json: any, request: any) {
    // Apply page[after].
    const afterStr = request.queryParams["page[after]"]
    const after = afterStr ? parseInt(afterStr) : 0;

    const hasPrevious = after > 0;
    if (hasPrevious) {
      json.data.splice(0, after);
    }

    // Apply page[size] (or default size).
    let size = ApiSerializer.DEFAULT_PAGE_SIZE;
    if (request.queryParams["page[size]"]) {
      size = parseInt(request.queryParams["page[size]"]);
    }
    const hasNext = json.data.length > size;
    // Delete all elements exceeding size.
    if (hasNext) {
      json.data.splice(size);
    }

    const withCursor = (cursor: number) => {
      const url = new URL(request.url)
      url.searchParams.set("page[size]", size.toString())
      url.searchParams.set("page[after]", cursor.toString())
      return url.toString()
    }
    const total = json.meta.count
    const last = total === 0 ? 0 : Math.floor((total - 1) / size) * size
    json.links = {
      first: withCursor(0),
      prev: after >= size ? withCursor(after - size) : null,
      self: withCursor(after),
      next: hasNext ? withCursor(after + size) : null,
      last: withCursor(last),
    }

    this.filterIncluded(json);
  }

  private _addIncludedRelationship(rid: ResourceIdentifierObject, json: any, included: ResourceObject[]) {
    const index = json.included.findIndex((resource: ResourceObject) => resource.id  == rid.id);
    if (index != -1) {
      const incl = json.included.splice(index, 1)[0];
      included.push(incl);
      // Recursive call to include nested resources.
      this._filterIncludedResource(incl, json, included);
    }
  }
  private _filterIncludedResource(resource: ResourceObject, json: any, included: ResourceObject[]) {
    if (resource.relationships) {
      Object.values(resource.relationships).forEach(rel => {
        if (rel.data) {
          if (Array.isArray(rel.data)) {
            rel.data.forEach( resource => this._addIncludedRelationship(resource, json, included));
          } else {
            this._addIncludedRelationship(rel.data, json, included);
          }
        }
      });
    }
  }
  /**
   * Removes unnecessary included objects after pagination.
   * 
   * @param json The paginated response
   */
  private filterIncluded(json: any) : void {
    const included: ResourceObject[] = [];
    if (json.included) {
      json.data.forEach((resource: ResourceObject) => {
        this._filterIncludedResource(resource, json, included);
      })
      json.included = included;
    }
  }

  /**
   * Add to collection responses.
  */
  serialize(object: any, request: Request) {
    const json = super.serialize(object, request);
    if (Array.isArray(json.data)) {
      json.meta = {
        count: json.data.length
      };
      this.paginate(json, request);
    }
    return json;
  }

  /**
   * Overwrite the default behavior with the identity.
   */
  keyForAttribute(key: string): string {
    return key;
  }
}
