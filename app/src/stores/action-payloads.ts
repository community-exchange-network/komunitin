import { ResourceIdentifierObject, ResourceObject } from "../store/model";

export interface CreatePayload<T extends ResourceObject> {
  /**
   * The group where the records belong to.
   */
  group: string;

  /**
   * The resource
   */
  resource: DeepPartial<T>;

  /**
   * Array of resources to be updated alongside the main resource.
   */
  included?: (DeepPartial<ResourceObject> & ResourceIdentifierObject)[]
}
export interface CreateListPayload<T extends ResourceObject> {
  /**
   * The group where the records belong to.
   */
  group: string;

  /**
   * The resources
   */
  resources: DeepPartial<T>[];
}

type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;

export interface UpdatePayload<T extends ResourceObject> {
  /**
   * The resource id/code.
   */
  id: string
  /**
   * The group where the record belongs to.
   */
  group: string;
  /**
   * The updated fields for the resource.
   */
  resource: DeepPartial<T> & ResourceIdentifierObject
  /**
   * Array of resources to be updated alongside the main resource.
   */
  included?: (DeepPartial<ResourceObject> & ResourceIdentifierObject)[]
}

export interface DeletePayload {
  /**
   * The resource id.
   */
  id: string
  /**
   * The group where the record belongs to.
   */
  group: string;
}

/**
 * Object argument for the `loadList` action.
 */
export interface LoadListPayload {
  /**
   * The group where the records belong to.
   */
  group: string;
  /**
   * The search query.
   */
  search?: string;
  /**
   * The current location.
   */
  location?: [number, number];
  /**
   * Filter by fields. For example `{"member": "some-uuid"}`
   */
  filter?: { [field: string]: string | string[] };
  /**
   * Sort the results using this field.
   */
  sort?: string;
  /**
   * Inlude related resources.
   */
  include?: string;
  /**
   * Updates current page and page set.
   * 
   * Set to false in calls to load auxiliar resources (not the current main list).
   */
  onlyResources?: boolean
  /**
   * Cache time in milliseconds. If the resource is already in cache and the cache time
   * has not expired, the resource is returned from cache. If the cache time has expired,
   * the resource is revalidated from the server.
   * 
   * By default, always revalidate from server.
   */
  cache?: number,
  /*
   * Size of the page to be fetched. If not set, the default page size is used.
   */
  pageSize?: number
}

/**
 * Use this payload to load a resource using a URL of the form
 * <BASE_URL>/:group/<resource_type>?filter[code]=:code
 */
export interface LoadByCodePayload {
  /**
   * The resource code.
   */
  code: string;
  /**
   * The resource group.
   */
  group: string;
  /**
   * Optional comma-separated list of included relationship resources.
   */
  include?: string;
  /**
   * Cache time in milliseconds. If the resource is already in cache and the cache time
   * has not expired, the resource is returned from cache. If the cache time has expired,
   * the resource is revalidated from the server.
   * 
   * By default, always revalidate from server.
   */
  cache?: number,
}

/**
 * Use this payload to load a resource using a URL of the form
 * <BASE_URL>/:group/<resource_type>/:id
 */
export interface LoadByIdPayload {
  /**
   * The resource id.
   */
  id: string;
  /**
   * The resource group.
   */
  group: string;
  /**
   * Optional comma-separated list of included relationship resources.
   */
  include?: string;
  /**
   * Cache time in milliseconds. If the resource is already in cache and the cache time
   * has not expired, the resource is returned from cache. If the cache time has expired,
   * the resource is revalidated from the server.
   * 
   * By default, always revalidate from server.
   */
  cache?: number,
}

/**
 * Use this payload to load an external resource given its URL.
  */
export interface LoadByUrlPayload {
  /**
   * The resource URL.
   */
  url: string;
  /**
   * Optional comma-separated list of included relationship resources.
   */
  include?: string
  /**
   * Cache time in milliseconds. If the resource is already in cache and the cache time
   * has not expired, the resource is returned from cache. If the cache time has expired,
   * the resource is revalidated from the server.
   * 
   * By default, always revalidate from server.
   */
  cache?: number,
}

/**
 * Object argument for the `load` action.
 */
export type LoadPayload = LoadByIdPayload | LoadByCodePayload | LoadByUrlPayload;

/**
 * Payload for the `loadNext` action.
 */
export interface LoadNextPayload {
  /**
   * Cache time in milliseconds. See `LoadListPayload.cache`.
   */
  cache?: number
}