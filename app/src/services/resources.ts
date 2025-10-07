import { type DeepPartial } from "quasar";
import KError, { checkFetchResponse } from "../KError";
import { ExternalResourceObject, ResourceIdentifierObject, ResourceObject } from "../store/model";
import { type TokenService } from "./auth";


interface BaseFetchOptions {
  include?: string[]
}
interface FetchByUrlOptions extends BaseFetchOptions {
  url: string
}
interface FetchByIdOptions extends BaseFetchOptions {
  id: string
  group: string
}
interface FetchByCodeOptions extends BaseFetchOptions {
  code: string
  group: string
}

export interface FetchByGroupOptions extends BaseFetchOptions {
  group: string;
  search?: string;
  location?: [number, number];
  filter?: { [field: string]: string | string[] };
  sort?: string;  
  pageSize?: number
}

export type GetResourceOptions = FetchByUrlOptions | FetchByIdOptions | FetchByCodeOptions
export type GetCollectionOptions = FetchByGroupOptions | FetchByUrlOptions
export interface CreateResourceOptions<T extends ResourceObject> {
  group: string
  resource: DeepPartial<T>
  included?: (DeepPartial<ResourceObject> & ResourceIdentifierObject)[]
}
export interface CreateCollectionOptions<T extends ResourceObject> {
  group: string
  resources: DeepPartial<T>[]
  included?: (DeepPartial<ResourceObject> & ResourceIdentifierObject)[]
}
export interface UpdateResourceOptions<T extends ResourceObject> {
  id: string,
  group: string
  resource: DeepPartial<T> & ResourceIdentifierObject
  included?: (DeepPartial<ResourceObject> & ResourceIdentifierObject)[]
}
export interface DeleteResourceOptions {
  id: string,
  group: string
}

export type FetchResourceResult<T> = { data: T | null, included: ResourceObject[] | null }
export type FetchCollectionResult<T> = { data: T[], included: ResourceObject[] | null, links: { prev: string|null, next: string|null } }

export interface ResourceService<T extends ResourceObject> {
  get(opts: GetResourceOptions): Promise<FetchResourceResult<T>>
  list(opts: GetCollectionOptions): Promise<FetchCollectionResult<T>>
  create(opts: CreateResourceOptions<T>): Promise<FetchResourceResult<T>>
  createList(opts: CreateCollectionOptions<T>): Promise<FetchCollectionResult<T>>
  update(opts: UpdateResourceOptions<T>): Promise<FetchResourceResult<T>>
  delete(opts: DeleteResourceOptions): Promise<void>
}

export interface ResourceServiceConfig {
  baseUrl: string,
  type: string,
  authService: TokenService,
  endpoints?: {
    /**
     * Endpoint for the collection of resources of this type. Override if
     * your resource doesn't follow the standard `/{groupCode}/{type}`.
     *
     * @param group The code of the group
     */
    collection: (group: string) => string,
    /**
     * Endpoint for a single resource of this type. Override if
     * your resource doesn't follow the standard:`
     * ```
     *  collection(group)/{id}.
     * ```
     *
     * @param id The id of the resource
     * @param group The code of the group
     */
    resource: (group: string, id: string) => string
  }
}
export class ResourceServiceImpl<T extends ResourceObject> implements ResourceService<T> {

  private static readonly API_MIME = "application/vnd.api+json";
  private baseUrl: string
  private readonly type: string
  private readonly endpoints: {
    collection: (group: string) => string,
    resource: (group: string, id: string) => string
  }
  private readonly authService: TokenService

  constructor(config: ResourceServiceConfig) {
    this.baseUrl = config.baseUrl;
    this.type = config.type;
    this.endpoints = config.endpoints || {
      collection: (group: string) => `/${group}/${this.type}`,
      resource: (group: string, id: string) => this.endpoints.collection(group) + `/${id}`
    }
    this.authService = config.authService;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url
  }

  private absoluteUrl(url: string) {
    return url.startsWith("http") ? url : this.baseUrl + url;
  }

  private resourceUrl(payload: GetResourceOptions) {
    let url: string
    let params: URLSearchParams;

    if ("url" in payload) {
      const urlObj = new URL(payload.url)
      params = urlObj.searchParams
      url = urlObj.origin + urlObj.pathname
    } else {
      params = new URLSearchParams()
      if ("code" in payload) {
        url = this.endpoints.collection(payload.group)
        params.set("filter[code]", payload.code)
      } else {
        url = this.endpoints.resource(payload.id, payload.group)
      }
    }
    
    if (payload.include) {
      params.set("include", payload.include.join(","));
    }
    
    const query = params.toString()
    if (query.length > 0) {
      url += "?" + query;
    }
    
    return url
  }

  private async request(url: string, method: "GET" | "POST" | "PATCH" | "DELETE" = "GET", data?: object) {
    url = this.absoluteUrl(url);
    
    const doFetch = async () => {
      const accessToken = await this.authService.getAccessToken();
      const headers: Record<string, string> = {}
      
      if (accessToken) {
        headers["Authorization"] = `Bearer ${accessToken}`
      }
      if (data) {
        headers["Content-Type"] = ResourceServiceImpl.API_MIME
      }
      if (method !== "DELETE") {
        headers["Accept"] = ResourceServiceImpl.API_MIME
      }

      return fetch(url, {
        method,
        headers,
        credentials: "include", // needed?
        body: data ? JSON.stringify(data) : undefined
      })
    }

    try {
      let response = await doFetch()
      if (response.status === 401) {
        // Unauthorized, maybe the token has expired, try to refresh it and repeat the request.
        await this.authService.refreshToken()
        response = await doFetch()
      }
      await checkFetchResponse(response)
      if (response.status === 204) {
        // No content
        return null;
      } else {
        return await response.json();
      }
    } catch (error) {
      throw KError.getKError(error);
    }
  }

  private async handleIncluded(included: ResourceObject[] | undefined) {
    if (Array.isArray(included) && included.length > 0) {
      const resources: ResourceObject[] = []
      const external: ExternalResourceObject[] = []
      for (const item of included) {
        if (item.meta?.external) {
          external.push(item as ExternalResourceObject)
        } else {
          resources.push(item)
        }
      }
      const externalResources = await this.fetchExternalResources(external)
      const allIncluded = resources.concat(externalResources)
      return allIncluded
    }
    return null
  }

  private async fetchExternalResources(external: ExternalResourceObject[]) {
    // We group all external resources by their type so we can fetch them all at once. This not only makes the
    // code more efficient, but also prevents concurrency errors in the server.
    const grouped: Record<string, ExternalResourceObject[]> = {}
    const single: string[] = []

    for (const resource of external) {
      if (resource.meta.href.endsWith(`${resource.type}/${resource.id}`)) {
        // This call can be grouped.
        const prefix = resource.meta.href.slice(0, -(resource.id.length + 1))
        if (grouped[prefix] === undefined) {
          grouped[prefix] = []
        }
        grouped[prefix].push(resource)
      } else {
        single.push(resource.meta.href)
      }
    }

    
    const results: ResourceObject[] = []
    const fetchOne = async (url: string) => {
      const result = await this.get({ url });
      if (result.data) {
        results.push(result.data)
      }
    }

    // Fetch single resources
    for (const url of single) {
      await fetchOne(url)
    }

    // Fetch grouped resources
    for (const [prefix, resources] of Object.entries(grouped)) {
      if (resources.length == 1) {
        await fetchOne(resources[0].meta.href)
      } else {
        // Actually more than just 1 recource.
        // We fetch them all at once by getting /type?filter[id]=id1,id2,...
        const ids = resources.map(r => r.id).join(",")
        const query = new URLSearchParams()
        query.set("filter[id]", ids)
        const url = prefix + "?" + query.toString()
        const data = await this.request(url);
        if (Array.isArray(data.data)) {
          results.push(...data.data)
        }
      }
    }

    return results
  }

  public async get(opts: GetResourceOptions): Promise<{ data: T | null, included: ResourceObject[] | null }> {
    const url = this.resourceUrl(opts);
    const data = await this.request(url);
    const resource = (Array.isArray(data.data) && data.data.length == 1) 
      ? data.data[0] 
      : data.data
    const included = await this.handleIncluded(data.included);
    return { data: resource, included }
  }

  private buildQuery(opts: FetchByGroupOptions) {
    // Build query string.
    const params = new URLSearchParams();
    if (opts.search) {
      params.set("filter[search]", opts.search);
    }
    if (opts.filter) {
      Object.entries(opts.filter).forEach(([field, value]) => {
        if (Array.isArray(value)) {
          value = value.join(",");
        }
        params.set(`filter[${field}]`, value);
      });
    }
    if (opts.location) {
      params.set(
        "geo-position",
        opts.location[0] + "," + opts.location[1]
      )
      if (!opts.sort) {
        opts.sort = "location";
      }
    }
    if (opts.sort) {
      params.set("sort", opts.sort);
    }
    if (opts.pageSize) {
      params.set("page[size]", opts.pageSize.toString());
    }

    if (opts.include) {
      params.set("include", opts.include.join(","));
    }
    return params.toString()
  }

  private collectionUrl(opts: GetCollectionOptions) {
    let url
    if ("url" in opts) {
      url = this.absoluteUrl(opts.url);
    } else {
      url = this.endpoints.collection(opts.group)
      const query = this.buildQuery(opts)
      if (query.length > 0) {
        url += "?" + query
      }
    }
    return url
  }

  public async list(opts: GetCollectionOptions): Promise<FetchCollectionResult<T>> {
    const url = this.collectionUrl(opts);
    const data = await this.request(url);
    const resources: T[] = Array.isArray(data.data) ? data.data : []
    const included = await this.handleIncluded(data.included);
    const links = {
      prev: (data.links?.prev ?? null) as string | null,
      next: (data.links?.next ?? null) as string | null
    }
    return { data: resources, included, links }

  }

  public async create(opts: CreateResourceOptions<T>): Promise<FetchResourceResult<T>> {
    const url = this.endpoints.collection(opts.group)
    const body = {
      data: opts.resource,
      ...(opts.included ? { included: opts.included } : {})
    }
    const data = await this.request(url, "POST", body);
    const resource = data.data as T
    return { data: resource, included: null }
  }

  public async createList(opts: CreateCollectionOptions<T>): Promise<FetchCollectionResult<T>> {
    const url = this.endpoints.collection(opts.group)
    const body = {
      data: opts.resources,
      ...(opts.included ? { included: opts.included } : {})
    }
    const data = await this.request(url, "POST", body);
    const resources: T[] = Array.isArray(data.data) ? data.data : []
    return { data: resources, included: null, links: { prev: null, next: null } }
  }

  public async update(opts: UpdateResourceOptions<T>): Promise<FetchResourceResult<T>> {
    const url = this.endpoints.resource(opts.group, opts.id)
    const body = {
      data: opts.resource,
      ...(opts.included ? { included: opts.included } : {})
    }
    const data = await this.request(url, "PATCH", body);
    const resource = data.data as T
    return { data: resource, included: null }
  }
  
  public async delete(opts: DeleteResourceOptions): Promise<void> {
    const url = this.endpoints.resource(opts.group, opts.id)
    await this.request(url, "DELETE");
  }


}