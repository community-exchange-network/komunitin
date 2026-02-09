import { cloneDeep } from "lodash-es";
import KError, { KErrorCode } from "src/KError";
import type { ActionContext, Module } from "vuex";

import type {
  CollectionResponseInclude,
  ExternalResourceObject,
  ResourceIdentifierObject,
  ResourceObject
} from "src/store/model";
import { apiRequest } from "./request";

export const DEFAULT_PAGE_SIZE = 20

export interface ResourcesState<T extends ResourceObject> {
  /**
   * Dictionary of resources indexed by id.
   */
  resources: Record<string, T>;
  /**
   * Queried object ids. Concretely:
   * pages[group][query][page] = [id1, id2, ...]
   */
  pages: Record<string, string[][]>
  /**
   * Id of current resource.
   */
  currentId: string | null;
  /**
   * The url of the next page. null means no next page, undefined means unknown.
   */
  next: string | null | undefined;
  /**
   * The url of the previous page. null means no previous page, undefined means unknown.
   */
  prev: string | null | undefined;
  /**
   * The index of the current page.
   */
  currentPage: number | null;
  /**
   * The cache key for this list.
   */
  currentQueryKey: string | null;
  /**
   * Timestamps for each resource id and pages, so we can know when they were last updated.
   * 
   * Note that the persist plugin has its own timestamps and cache invalidation mechanism.
   * 
   * The keys are the strings "resources/:id" or "pages/:query/:page".
   */
  timestamps: Record<string, number>
}
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

type Getter = 
  & ((id: string) => ResourceObject)
  & ((conditions: Record<string, string>) => ResourceObject);

/**
 * Flexible Vuex Module used to retrieve, store and provide resources fetched from the
 * Komunitin Apis. The implementation is generic for any resource thanks to the JSONAPI
 * spec.
 *
 * Getters:
 * - `current`: Gives the current resource.
 * - `one`: Gives a resource given its id.
 * - `page`: Gives a page of resources given its index.
 *
 * Actions:
 * - `load`: Fetches the current resource. Accepts the `LoadPayload` argument.
 * - `loadList`: Fetches the current list of resources. Accepts the `LoadListPayload` argument.
 */
export class Resources<T extends ResourceObject, S> implements Module<ResourcesState<T>, S> {
  namespaced = true;

  /**
   * The resource type.
   */
  readonly type: string;
  /**
   * The API base URL.
   */
  baseUrl: string;

  /**
   * @param type The resource type.
   * @param baseUrl The API URL.
   */
  public constructor(type: string, baseUrl: string) {
    this.type = type;
    this.baseUrl = baseUrl;
  }

  public setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  /**
   * Endpoint for the collection of resources of this type. Override if
   * your resource doesn't follow the standard `/{groupCode}/{type}`.
   *
   * @param groupCode The code of the group
   */
  protected collectionEndpoint(groupCode: string) {
    return `/${groupCode}/${this.type}`;
  }

  /**
   * Endpoint for a single resource of this type. Override if
   * your resource doesn't follow the standard:`
   * ```
   *  collectionEndpoint(groupCode)/{id}.
   * ```
   *
   * @param groupCode The code of the group
   * @param id The id of the resource
   */
  protected resourceEndpoint(groupCode: string, id: string) {
    return this.collectionEndpoint(groupCode) + `/${id}`;
  }

  /**
   * Override this method to add getters for inverse relationships of this resource.
   *
   * If a resource of type A has a one-to-one relationship to this resource but
   * this resource doesn't directly have the inverse relationship, by declaring
   * the inverse relatinship the resource object will behave as if the inverse 
   * relationship was also present in the API. The loading of the related object,
   * however, can't be done using the `include` parameter of load actions, but
   * has to be done through a separate load action. It also works with external 
   * relationships.
   *
   *
   * @returns an object with the inverse relationship name as keys and, as values,
   * a descriptor object with entries `module` for the vuex module name that manages
   * the related resource and `field` for the name of the direct relationship from
   * the related resource to this resource.
   */
  protected inverseRelationships(): Record<string, { module: string; field: string }> {
    return {};
  }

  private absoluteUrl(url: string) {
    return url.startsWith("http") ? url : this.baseUrl + url;
  }

  private async request(context: ActionContext<ResourcesState<T>, S>, url: string, method?: "get"|"post"|"patch"|"delete", data?: Record<string, unknown> | unknown[]) {
    // Resolve URL. Usually we're given relative urls except for the case when retreiving
    // the next page of a list, where we're given the absolute url directly from the API.
    url = this.absoluteUrl(url)

    return apiRequest(context, url, method, data)

  }

  /**
   * Trigger `add` commit to the relevant modules for each resource given.
   *
   * If there are included external resources, then dispatch actions to load them. The
   * returned promise will resolve when these actions fulfill.
   *
   * @param included Included resources
   * @param commit Commit function
   */
  protected async handleIncluded(
    included: ResourceObject[],
    context: ActionContext<ResourcesState<T>, S>
  ) {
    // Here we commit all included resources and accumulate all external resources for later fetch.
    const external: ExternalResourceObject[] = []
    included.forEach(resource => {
      if (!(resource as ExternalResourceObject).meta?.external) {
        // Standard included resource. Commit change!
        context.commit(resource.type + "/addResource", resource, { root: true });
      } else {
        // External included resource.
        external.push(resource as ExternalResourceObject)
      }
    })

    await this.fetchExternalResources(external, context)
    
  }

  /**
   * Fetches external resources.
   *
   * @param external External resources
   * @param dispatch Dispatch function
   */
  protected async fetchExternalResources(
    external: ExternalResourceObject[],
    context: ActionContext<ResourcesState<T>, S>): Promise<void> {
    // We group all external resources by their type so we can fetch them all at once. This not only makes the
    // code more efficient, but also prevents concurrency errors in the server.
    const grouped: Record<string, ExternalResourceObject[]> = {}
    const single: Record<string, ExternalResourceObject> = {}

    for (const resource of external) {
      if (resource.meta.href.endsWith(`${resource.type}/${resource.id}`)) {
        // This call can be grouped.
        const prefix = resource.meta.href.slice(0, -(resource.id.length + 1))
        if (grouped[prefix] === undefined) {
          grouped[prefix] = []
        }
        grouped[prefix].push(resource)
      } else {
        single[resource.meta.href] = resource
      }
    }

    // Fetch single resources
    for (const [url, resource] of Object.entries(single)) {
      await context.dispatch(`${resource.type}/load`, { url }, { root: true })
    }

    // Fetch grouped resources
    for (const [prefix, resources] of Object.entries(grouped)) {
      const type = resources[0].type
      if (resources.length == 1) {
        await context.dispatch(`${type}/load`, { url: resources[0].meta.href }, { root: true })
      } else {
        // Actually more than just 1 recource.
        // We fetch them all at once by getting /type?filter[id]=id1,id2,...
        const ids = resources.map(resource => resource.id).join(",")
        const query = new URLSearchParams()
        query.set("filter[id]", ids)
        const url = prefix + "?" + query.toString()
        const data = await this.request(context, url)
        context.commit(`${type}/addResources`, data.data, { root: true })
      }
    }
  }


  /**
   * Commits the results provided by AxiosResponse and then it eventually fetches
   * the external relationships.
   */
  protected async handleCollectionResponse(
    data: CollectionResponseInclude<T, ResourceObject>,
    context: ActionContext<ResourcesState<T>, S>,
    key: string,
    page: number,
    onlyResources?: boolean
  ) {
    const { commit } = context;
    
    // Commit included resources.
    if (data.included) {
      await this.handleIncluded(data.included, context);
    }

    // Commit mutation(s) after commiting included and eventualy fetched external resources.
    if (!onlyResources) {
      commit("next", data.links?.next ?? null)
      commit("prev", data.links?.prev ?? null)
      this.setPageResources(context, key, page, data.data)
    } else {
      commit("addResources", data.data)
    }
    
  }
  /**
   * Foreach relationship in main resource with linkage data, add a property of the same
   * name to the object with the value of the linked resource(s). This is done through a
   * getter that lazily loads related resources from the store.
   *
   * @param rootGetters Store getters object.
   * @param main ResourceObject.
   *
   * @return the main ResourceObject
   */
  protected relatedGetters(rootGetters: Record<string, Getter>, main: T): T {
    // Copy object so we don't modify the object in state.
    main = JSON.parse(JSON.stringify(main));
    
    // Add getters for relationships.
    if (main.relationships) {
      const relationships = Object.entries(main.relationships).filter(
        ([, value]) => value.data !== undefined
      );
      if (relationships.length > 0) {
        relationships.forEach(([name, value]) => {
          if (Array.isArray(value.data)) {
            Object.defineProperty(main, name, {
              get: function() {
                const items = (value.data as ResourceIdentifierObject[]).map(
                  resourceId =>
                    rootGetters[resourceId.type + "/one"](resourceId.id)
                );
                // Return either all or no objects.
                return items.includes(null) ? null : items;
              }
            });
          } else {
            Object.defineProperty(main, name, {
              get: function() {
                const resourceId = value.data as ResourceIdentifierObject;
                return resourceId === null ? null : rootGetters[resourceId.type + "/one"](resourceId.id);
              }
            });
          }
        });
      }
    }
    // Add getters for inverse relationships (only one-to-one).
    const inverses = this.inverseRelationships();
    Object.keys(inverses)
      .filter(name => !name.includes("."))
      .forEach(name => {
        Object.defineProperty(main, name, {
          get: function() {
            return rootGetters[inverses[name].module + "/find"]({
              [inverses[name].field]: main.id
            });
          }
        });
      });
    return main;
  }

  state = {
    resources: {},
    pages: {},
    currentId: null,
    next: undefined,
    prev: undefined,
    currentPage: null,
    currentQueryKey: null,
    timestamps: {}
  } as ResourcesState<T>;

  getters = {
    /**
     * Gets a resource given its id.
     */
    one: (
      state: ResourcesState<T>,
      _getters: unknown,
      _rootState: unknown,
      rootGetters: Record<string, Getter>
    ) => (id: string) =>
      state.resources[id]
        ? this.relatedGetters(rootGetters, state.resources[id])
        : null,
    /**
     * Gets the first resource meeting some criteria. Criteria is a map with 
     * field => value. 
     * 
     * If field is an attribute, the value is matched with attribute value.
     * If field is a relationship, the value is mathed against the related resource id.
     */
    find: (
      state: ResourcesState<T>,
      _getters: unknown,
      _rootState: unknown,
      rootGetters: Record<string, Getter>
    ) => (conditions: Record<string, string>) => {
      const targets = Object.values(state.resources).filter((resource: ResourceObject) =>
        Object.entries(conditions).every(
          ([field, value]) => {
            if (resource.attributes?.[field]) {
              return resource.attributes[field] == value;
            } else {
              // Check that the relationship is defined and is to-one.
              const rel = resource.relationships?.[field]?.data
              // Note that rel can only be null, an array or an object (ResourceIdentifier).
              return rel && !Array.isArray(rel) && rel.id == value;
            }
          }
        )
      );
      // In the improbable case we have more than one resource meeting the criteria, 
      // we return the last one. This may help in cases where this function is used
      // to find inverse one-to-one relationships that just changed, because the Object.values()
      // order is the insertion order so we'll get the most updated object.
      return targets.length > 0 ? this.relatedGetters(rootGetters, targets.pop()) : null;
    },

    /**
     * Gets the current resource.
     */
    current: (
      state: ResourcesState<T>,
      _getters: unknown,
      _rootState: unknown,
      rootGetters: Record<string, Getter>
    ) =>
      state.currentId != null
        ? this.relatedGetters(rootGetters, state.resources[state.currentId])
        : undefined,

    page: (
      state: ResourcesState<T>,
      _getters: unknown,
      _rootState: unknown,
      rootGetters: Record<string, Getter>
    ) => (index: number) => {
      if (state.currentQueryKey !== null && state.pages[state.currentQueryKey] && state.pages[state.currentQueryKey][index]) {
        return state.pages[state.currentQueryKey][index]
          .map(id => state.resources[id])
          .map(resource => this.relatedGetters(rootGetters, resource))
      } else {
        return undefined;
      }
    },

    currentList: (
      state: ResourcesState<T>,
      _getters: unknown,
      _rootState: unknown,
      rootGetters: Record<string, Getter>
    ) => {
      const queryKey = state.currentQueryKey
      if (queryKey !== null && queryKey in state.pages && Array.isArray(state.pages[queryKey])) {
        return ([] as string[]).concat(...(state.pages[queryKey])) // flatten
          .map(id => state.resources[id])
          .map(resource => this.relatedGetters(rootGetters, resource))
      } else {
        return undefined
      }
    },
       
    /**
     * Returns whether the current list has more resources to be fetched, or undefined if not known.
     */
    hasNext: (state: ResourcesState<T>) =>
      state.next === undefined ? undefined : state.next !== null,

    hasPrev: (state: ResourcesState<T>) =>
      state.prev === undefined ? undefined : state.prev !== null

  };

  mutations = {
    /**
     * Update the current list of resources
     */
    setPageIds: (state: ResourcesState<T>, {key, page, ids}: {key: string, page: number, ids: string[]}) => {
      if (state.pages[key] === undefined) {
        state.pages[key] = []
      }
      state.pages[key][page] = ids;
      state.timestamps["pages/" + key + "/" + page] = Date.now()
    },
    /**
     * Add a resource to the dictionary without updating the current resource.
     */
    addResource: (state: ResourcesState<T>, resource: T) => {
      state.resources[resource.id] = resource
      state.timestamps["resources/" + resource.id] = Date.now()
    },
    /**
     * Add the given resources to the resource list, without modifying current resource pointers.
     */
    addResources: (state: ResourcesState<T>, resources: T[]) => {
      const now = Date.now()
      resources.forEach(resource => {
        state.resources[resource.id] = resource
        state.timestamps["resources/" + resource.id] = now
      });
    },
    /**
     * Removes resource from list.
     */
    removeResource: (state: ResourcesState<T>, id: string) => {
      delete state.timestamps["resources/" + id]
      delete state.resources[id]
    },
    /**
     * Update the current resource pointer.
     */
    currentId: (state: ResourcesState<T>, id: string|null) => {
      state.currentId = id;
    },
    /**
     * Update the next link.
     */
    next(state: ResourcesState<T>, next: string | null | undefined) {
      state.next = next;
    },
    /**
     * Update the previous link.
     */
    prev(state: ResourcesState<T>, prev: string | null | undefined) {
      state.prev = prev;
    },
    /**
     * Update the current page index.
     */
    currentPage(state: ResourcesState<T>, index: number | null) {
      state.currentPage = index
    },
    /**
     * Update the current query key.
     */
    currentQueryKey(state: ResourcesState<T>, key: string) {
      state.currentQueryKey = key
    }
  };

  actions = {
    loadList: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: LoadListPayload
    ) => this.loadList(context, payload),
    loadNext: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: LoadNextPayload
    ) => this.loadNext(context, payload),
    loadPrev: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: LoadNextPayload
    ) => this.loadPrev(context, payload),
    load: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: LoadPayload
    ) => this.load(context, payload),
    create: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: CreatePayload<T>
    ) => this.create(context, payload),
    createList: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: CreateListPayload<T>
    ) => this.createList(context, payload),
    update: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: UpdatePayload<T>
    ) => this.update(context, payload),
    delete: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: DeletePayload
    ) => this.delete(context, payload),
    setCurrent: (
      context: ActionContext<ResourcesState<T>, S>,
      payload: T
    ) => this.setCurrent(context, payload)
  };
  /**
   * Build the url for the next or previous page.
   * 
   * @param currentUrl The url of the current page.
   * @param pageOffset The number of pages to move. Negative values move to previous pages.
   * @returns 
   */
  protected buildAdjacentUrl(currentUrl: string, pageOffset: number) {
    const adjacentUrl = new URL(this.absoluteUrl(currentUrl))

    const cursor = adjacentUrl.searchParams.has("page[after]") 
      ? parseInt(adjacentUrl.searchParams.get("page[after]"))
      : 0

    const size = adjacentUrl.searchParams.has("page[size]")
      ? parseInt(adjacentUrl.searchParams.get("page[size]"))
      : DEFAULT_PAGE_SIZE

    const newCursor = cursor + pageOffset * size

    adjacentUrl.searchParams.set("page[after]", newCursor.toString())
    return adjacentUrl.toString()
  }
  
  /**
   * Creates the API query string for this list filters.
   */
  protected buildQuery(payload: LoadListPayload): string {
    // Build query string.
    const params = new URLSearchParams();
    if (payload.search) {
      params.set("filter[search]", payload.search);
    }
    if (payload.filter) {
      Object.entries(payload.filter).forEach(([field, value]) => {
        if (Array.isArray(value)) {
          value = value.join(",");
        }
        params.set(`filter[${field}]`, value);
      });
    }
    if (payload.location) {
      params.set(
        "geo-position",
        payload.location[0] + "," + payload.location[1]
      )
      if (!payload.sort) {
        payload.sort = "location";
      }
    }
    if (payload.sort) {
      params.set("sort", payload.sort);
    }
    if (payload.pageSize) {
      params.set("page[size]", payload.pageSize.toString());
    }

    if (payload.include) {
      params.set("include", payload.include);
    }
    return params.toString()
  }

  /**
   * Creates a string that identifies this list filters for caching purposes.
   */
  protected buildQueryKey(payload: LoadListPayload): string {
    const params = new URLSearchParams()
    params.set("group", payload.group)
    if (payload.search) {
      params.set("search", payload.search)
    }
    if (payload.filter) {
      Object.entries(payload.filter).map(([field, value]) => {
        if (Array.isArray(value)) {
          value = value.join(",");
        }
        params.set(`filter[${field}]`, value);
      });
    }
    if (payload.sort) {
      params.set("sort", payload.sort);
    }
    if (payload.pageSize) {
      params.set("pageSize", payload.pageSize.toString())
    }
    return params.toString()
  }

  /**
   * Fetches the current list of resources.
   *
   * @param payload Configure the request by filtering the results, including related resources, including the current location, sorting.
   */
  protected async loadList(
    context: ActionContext<ResourcesState<T>, S>,
    payload: LoadListPayload
  ) {
    // Initialize the state to the first page.
    const queryKey = this.buildQueryKey(payload)
    if (!payload.onlyResources) {
      context.commit("currentQueryKey", queryKey)
      context.commit("currentPage", 0)
      context.commit("next", undefined)
    }
    
    // At this point the data may already be cached and hence available to the UI.

    // Build fetch url.
    let url = this.collectionEndpoint(payload.group);
    const query = this.buildQuery(payload);
    if (query.length > 0) url += "?" + query;

    if (payload.cache) {
      const timestamp = context.state.timestamps["pages/" + queryKey + "/0"]
      if (timestamp && timestamp + payload.cache > Date.now()) {
        // We have the value in cache and it's not expired, so we're done. Note that having the timestamps
        // entry already means that we have the value entry. 
        // We don't have, however, the next page link, but it can be computed form the current query.
        const next = this.buildAdjacentUrl(url, +1)
        context.commit("next", next)
        context.commit("prev", null)
        return
      }
    }

    // Revalidate the data by doing the request.
    // Call API
    try {
      const data = await this.request(context, url) as CollectionResponseInclude<T, ResourceObject>
      await this.handleCollectionResponse(
        data,
        context,
        queryKey,
        0,
        payload.onlyResources
      );
    } catch (error) {
      throw KError.getKError(error);
    }
  }
  
  protected async loadNext(
    context: ActionContext<ResourcesState<T>, S>,
    payload: LoadNextPayload
  ) {
    await this.loadAdjacent(context, payload, +1, context.state.next)
  }
  protected async loadPrev(
    context: ActionContext<ResourcesState<T>, S>,
    payload: LoadNextPayload
  ) {
    await this.loadAdjacent(context, payload, -1, context.state.prev)
  }
  protected async loadAdjacent(
    context: ActionContext<ResourcesState<T>, S>,
    payload: LoadNextPayload,
    pageOffset: number,
    url: string|null|undefined
  ) {
    if (url === undefined || context.state.currentPage === null || context.state.currentQueryKey == null) {
      throw new KError(
        KErrorCode.ScriptError,
        "Unexpected call to 'loadNext/loadPrev' resource action before calling to loadList."
      );
    }
    // This means there is no next/prev page
    if (url === null) {
      return
    }
    
    const page = context.state.currentPage + pageOffset;
    const queryKey = context.state.currentQueryKey

    try {
      // Update page number  
      context.commit("currentPage", page)

      // At this point the data may be already cached and available for the UI.
      if (payload.cache) {
        const timestamp = context.state.timestamps["pages/" + queryKey + "/" + page]
        if (timestamp && timestamp + payload.cache > Date.now()) {
          // We have the value in cache and it's not expired, so we're done. Note that having the timestamps
          // entry already means that we have the value entry. We need to compute the next page link.
          context.commit("next", this.buildAdjacentUrl(url, +1))
          context.commit("prev", this.buildAdjacentUrl(url, -1))
          return
        }
      }
      
      // Perform the request.
      const data = await this.request(context, url) as CollectionResponseInclude<T, ResourceObject>
      await this.handleCollectionResponse(
        data,
        context,
        queryKey,
        page,
      );
    } catch (error) {
      throw KError.getKError(error);
    }
  }

  protected loadCached (
    context: ActionContext<ResourcesState<T>, S>,
    payload: LoadPayload
  ) {
    let id = null
    if ("url" in payload) {
      // Try to get the ID from the URL. That may work for accounts and other resources 
      // if the /accounts/:id, but there are other valid URLs that don't have the id.
      const path = payload.url.split("/")
      const lastUrlParam = path.pop()
      if (lastUrlParam && context.state.resources[lastUrlParam]) {
        id = lastUrlParam
      }
      // For "/:group/currency" urls we can get the code from the URL.
      if (lastUrlParam === "currency") {
        const code = path.pop()
        const cached = context.getters['find']({ code })
        if (cached) {
          id = cached.id
        }
      }
    } else if ("id" in payload && context.state.resources[payload.id]) {
      // payload sometimes contains the id
      id = payload.id
    } else {
      // and sometimes payload contains the code attribute which can 
      // be used to find the resource as well.
      const groupCodeTypes = ["currencies", "currency-settings", "groups", "group-settings"]
      const code = groupCodeTypes.includes(this.type) ? payload.group : (payload as LoadByCodePayload).code

      const cached = context.getters['find']({ code })
      if (cached) {
        id = cached.id
      }
    }
    context.commit("currentId", id)
  }

  protected resourceUrl(payload: LoadPayload) {
    let url: string
    let params: URLSearchParams;

    if ("url" in payload) {
      const urlObj = new URL(payload.url)
      params = urlObj.searchParams
      url = urlObj.origin + urlObj.pathname
    } else {
      params = new URLSearchParams()
      if ("code" in payload) {
        url = this.collectionEndpoint(payload.group)
        params.set("filter[code]", payload.code)
      } else {
        url = this.resourceEndpoint(payload.group, payload.id)
      }
    }
    
    if (payload.include) {
      params.set("include", payload.include);
    }
    
    const query = params.toString()
    if (query.length > 0) {
      url += "?" + query;
    }
    
    return url
  }
  /**
   * Fetches the current reaource.
   */
  protected async load(
    context: ActionContext<ResourcesState<T>, S>,
    payload: LoadPayload
  ) {
    // First, try to find the required resource in cache so we can render
    // some content before hitting the API.
    this.loadCached(context, payload)

    if (payload.cache && context.state.currentId !== null) {
      // Check if the resource (and all required included relationships) is already in cache and valid.
      const checkCachedResourceWithRelationships = (id: string, cache: number, context: ActionContext<ResourcesState<T>, S>, include?: string) => {
        const checkCachedResource = <U extends ResourceObject>(id: string, cache: number, state: ResourcesState<U>) => {
          const timestamp = state.timestamps["resources/" + id]
          return timestamp && timestamp + cache > Date.now()
        }

        if (!checkCachedResource(id, cache, context.state)) {
          return false
        }        
        if (include) {
          const resource = context.getters.one(id)
          const included = include.split(",")
          for (const key of included) {
            const chain = key.split(".")
            let related = resource
            for (const relationship of chain) {
              if (relationship in related && typeof related[relationship] === "object") {
                related = related[relationship]
              } else {
                return false
              }
            }
            // Check if related resource is sufficiently updated
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const relatedState = (context.rootState as any)[related.type]
            if (!checkCachedResource(related.id, cache, relatedState)) {
              return false
            }
          }
        }
        return true
      }
      
      if (checkCachedResourceWithRelationships(context.state.currentId, payload.cache, context, payload.include)) {
        return
      }
      
    }
    
    // Fetch (or revalidate) the content.
    const url = this.resourceUrl(payload);
    // Call API
    try {
      const data = await this.request(context, url);
      const resource = ((Array.isArray(data.data) && data.data.length == 1) 
        ? data.data[0] 
        : data.data) as T
      // Commit mutation(s).
      this.setCurrent(context, resource)
      if ('included' in data) {
        await this.handleIncluded(
          data.included,
          context
        );
      }
    } catch (error) {
      throw KError.getKError(error);
    }
  }
  /**
   * Creates a resource by posting the given resource to the API.
   * The response is updated to the current resource.
   */
  protected async create(
    context: ActionContext<ResourcesState<T>, S>,
    payload: CreatePayload<T>
  ) {
    const url = this.collectionEndpoint(payload.group)
    const body = {data: payload.resource, ...{included: payload.included}};
    try {
      const data = await this.request(context, url, "post", body)
      const resource = data.data as T
      this.setCurrent(context, resource)
    } catch (error) {
      throw KError.getKError(error);
    }
  }
  /**
   * Create multiple resources by posting the given resources to the API.
   * This action is only available for transfers at the moment. The response
   * is updated to the current resource list.
   */
  protected async createList(
    context: ActionContext<ResourcesState<T>, S>,
    payload: CreateListPayload<T>
  ) {
    const url = this.collectionEndpoint(payload.group)
    const resources = payload.resources;
    const body = {data: resources};
    try {
      const data = await this.request(context, url, "post", body)
      const resources = data.data as T[]
      // Update the current list of resources. Use a special Key for this list.
      const queryKey = "createList"
      this.setPageResources(context, queryKey, 0, resources)
      context.commit("currentQueryKey", queryKey)
      context.commit("currentPage", 0)
      context.commit("next", null) // No next.
    } catch (error) {
      throw KError.getKError(error);
    }
  }
  /**
   * Updates a resource by patching the given resource to the API.
   * The response is updated in the current resource.
   */
  protected async update(
    context: ActionContext<ResourcesState<T>, S>,
    payload: UpdatePayload<T>
  ) {
    const url = this.resourceEndpoint(payload.group, payload.id);
    const body = {data: payload.resource, ...{included: payload.included}};
    try {
      const data = await this.request(context, url, "patch", body) 
      const resource = data.data as T
      this.setCurrent(context, resource)
    } catch (error) {
      throw KError.getKError(error);
    }
  }

  /**
   * Deletes a resource by calling the API. The resource is removed from the store, 
   * and if it was the current resource, then it is unset.
   */
  protected async delete(
    context: ActionContext<ResourcesState<T>, S>,
    payload: DeletePayload
  ) {
    // We allow getting the resource from the code, but this is to be deprecated in
    // favor of using the id.
    const resource = context.getters.one(payload.id) 
      ?? context.getters.find({code: payload.id})
    
    const id = resource.id
    const url = this.resourceEndpoint(payload.group, payload.id)
    try {
      await this.request(context, url, "delete")
      // Remove from current pointer.
      if (context.state.currentId == id) {
        context.commit("currentId", null)
      }
      // Remove from pages.
      for (const key in context.state.pages) {
        const pages = context.state.pages[key]
        let afterDelete = false
        for (let i = 0; i < pages.length; i++) {
          // Remove the id from the page
          if (pages[i].includes(id)) {
            pages[i] = pages[i].filter(rid => rid != id)
            afterDelete = true
          }
          // From the altered page onwards, shift one id to the left.
          if (afterDelete) {
            if (i < pages.length - 1 && pages[i+1].length > 0) {
              pages[i].push(pages[i+1].shift())
            }
            context.commit("setPageIds", {key, page: i, ids: pages[i]})
          }
        }
      }
      // Remove from store.
      context.commit("removeResource", id)
    } catch (error) {
      throw KError.getKError(error);
    }  
  }

  /**
   * Sets the current resource. Use this action when setting a resource created 
   * from the client and not fetched from the API, or internally from other actions.
   */
  protected setCurrent(context: ActionContext<ResourcesState<T>, S>, resource: T) {
    context.commit("addResource", this.updatedResource(context.state, resource))
    context.commit("currentId", resource.id)
  }

  /**
   * Use internally from other actions when adding new resources and updating the page ids list. 
   */
  protected setPageResources(context: ActionContext<ResourcesState<T>, S>, key: string, page: number, resources: T[]) {
    context.commit("addResources", this.updatedResources(context.state, resources))
    context.commit("setPageIds", {key, page, ids: resources.map(resource => resource.id)})
  }
  
  /**
   * Array version of updatedResource().
   */
  protected updatedResources(state: ResourcesState<T>, resources: T[]) {
    return resources.map((resource) => this.updatedResource(state, resource))
  }
  /**
   * If the resource already exists, it will merge the new with the old object.
   * Note: this architecture may be buggy if an update happens to delete some
   * object property, but so far this does not seem to be a problem.
   */
  protected updatedResource(state: ResourcesState<T>, resource: T) {
    if (state.resources[resource.id] === undefined) {
      return resource
    } else {
      // We're merging the existing object with the new one, but only on the
      // first level. This means that we're just not losing the included loaded
      // relations while overwriting all attributes.
      return {
        ...cloneDeep(state.resources[resource.id]),
        ...resource
      }
    }
  }

}
