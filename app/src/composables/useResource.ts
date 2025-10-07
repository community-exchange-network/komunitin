import { computed, MaybeRefOrGetter, ref, toValue, watch } from "vue";
import { ResourceIdentifierObject, ResourceObject } from "../store/model";
import { ResourceStore, useResourceStore } from "../stores/resources";
import { services, getService } from "src/services/services"
import { FetchByGroupOptions, FetchResourceResult, GetCollectionOptions, GetResourceOptions } from "../services/resources";
import KError, { KErrorCode } from "../KError";
import { DeepPartial } from "quasar";

type WithUseOptions<T> = T & { 
  /**
   * Cache time in milliseconds. If the resource is already in cache and the cache time
   * has not expired, the resource is returned from cache. If the cache time has expired,
   * the resource is revalidated from the server.
   * 
   * By default, always revalidate from server.
   */
  cache?: number
  /**
   * If true or undefined, the resources are loaded immediately.
   */
  immediate?: boolean
}

export type UseResourceOptions = WithUseOptions<GetResourceOptions>
export type UseResourcesOptions = WithUseOptions<FetchByGroupOptions> 

/**
 * Enhances a resource object with relationships so that it
 * access the related resources directly using the store.
 * @param resource 
 */
const enhanceResource = <T extends ResourceObject>(store: ResourceStore, resource: T): T => {
  return new Proxy(resource, {
    get(target, prop, receiver) {
      // Quickly return target property if it exists
      if (prop in target) {
        return Reflect.get(target, prop, receiver)
      }

      const propName = prop as string

      // Intercept access to properties named equal to relationship names
      if (target.relationships?.[propName]?.data !== undefined) {
        const data = target.relationships[propName].data
        if (Array.isArray(data)) {
          // To-many relationship
          const items = data.map((resourceId) => {
            const relatedResource = store.get(resourceId.type, resourceId.id)
            return relatedResource ? enhanceResource(store, relatedResource) : null
          })
          // Return either all items or null if any are missing
          return items.includes(null) ? null : items
        } else {
          // To-one relationship
          if (data === null) {
            return null
          }
          const relatedResource = store.get(data.type, data.id)
          return relatedResource ? enhanceResource(store, relatedResource) : null
        }
      }

      // Handle inverse relationships
      const config = services.getConfig(target.type)
      const inverses = config.inverseRelationships
      if (inverses && propName in inverses) {
        const inverseConfig = inverses[propName]
        const relatedResource = store.find(inverseConfig.type, {
          [inverseConfig.relationship]: target.id
        })
        return relatedResource ? enhanceResource(store, relatedResource) : null
      }
      
      return undefined
    }
  })
}

const getResourceId = (type: string, options: UseResourceOptions, store: ResourceStore) => {
  let id = null
  if ("url" in options) {
    // Try to get the ID from the URL. That may work for accounts and other resources 
    // if the /accounts/:id, but there are other valid URLs that don't have the id.
    const path = options.url.split("/")
    const lastUrlParam = path.pop()
    if (lastUrlParam && store.get(type, lastUrlParam)) {
      id = lastUrlParam
    }
    // For "/:group/currency" urls we can get the code from the URL.
    if (lastUrlParam === "currency") {
      const code = path.pop()
      const cached = store.find(type, { code })
      if (cached) {
        id = cached.id
      }
    }
  } else if ("id" in options && store.get(type, options.id)) {
    // payload sometimes contains the id
    id = options.id
  } else {
    // and sometimes payload contains the code attribute which can 
    // be used to find the resource as well.
    // Sometimes the code is passed actually in the id param. We should clean that!
    const code = ("code" in options) ? options.code : options.id
    const cached = store.find(type, { code })
    if (cached) {
      id = cached.id
    }
  }
  return id
}

/**
 * @param resource The enhanced version of the resource.
 */
const isFreshWithRelationships = <T extends ResourceObject>(store: ResourceStore, resource: T, options: UseResourceOptions) => {
  // Check if cache is enabled
  if (!options.cache) {
    return false
  }
  // Check if object itself is fresh
  if (!store.isFresh(resource.type, resource.id, options.cache)) {
    return false   
  }
  // Check every included resource is fresh
  if (options.include) {
    for (const key of options.include) {
      let related = resource
      const chain = key.split(".")
      for (const relationship of chain) {
        if (related[relationship as keyof T]) {
          related = related[relationship as keyof T] as T
        } else {
          return false
        }
      }
      if (!store.isFresh(related.type, related.id, options.cache)) {
        return false
      }
    }
  }
  return true
}

export const useResource = <T extends ResourceObject>(type: string, options: MaybeRefOrGetter<UseResourceOptions>) => {
  const store = useResourceStore()  
  const service = getService<T>(type)

  const resourceId = ref<string | null>(null)

  watch(
    () => toValue(options),
    (options) => {
      const computedId = getResourceId(type, options, store)
      if (computedId !== null) { 
        // Stick with last known id if we can't compute a new one.
        resourceId.value = computedId
      }
    },
    {immediate: true}
  )

  const resource = computed<T|null>(() => {
    if (!resourceId.value) {
      return null
    }
    const rawResource = store.get<T>(type, resourceId.value)
    return rawResource ? enhanceResource(store, rawResource) : null
  })

  const loading = ref(false)

  const updateStore = (response: FetchResourceResult<T>) => {
    if (response.included) {
      store.setMany(response.included)
    }
    if (response.data !== null) {
      store.set(response.data)
    }
  }

  const loadResource = async (options: UseResourceOptions) => {
    try {
      loading.value = true
      
      if (resource.value && isFreshWithRelationships(store, resource.value, options)) {
        // If cache param was given and the content is sufficiently fresh 
        // (including relationships) we dont hit the api.
        return
      }

      // Fetch or revalidate the content from the api.
      const response = await service.get(options)
      updateStore(response)

      // In some cases we may not know the id until we fetch the resource
      // e.g. when fetching the current user with /users/me or when fetching
      // by code with /members?filter[code]=XYZ
      resourceId.value = response.data ? response.data.id : null
    } finally {
      loading.value = false
    }
  }

  const getGroup = () => {
    const optionsVal = toValue(options)
    if (!("group" in optionsVal)) {
      throw new KError(KErrorCode.ScriptError, "Required group for this operation")
    }
    return optionsVal.group
  }

  const updateResource = async (data: {
    resource: DeepPartial<T> & ResourceIdentifierObject,
    included?: (DeepPartial<ResourceObject> & ResourceIdentifierObject)[]
  }) => {
    if (!resource.value) {
      throw new KError(KErrorCode.ScriptError, "No loaded resource to update")
    }
    
    try {
      loading.value = true

      const response = await service.update({
        id: resource.value.id,
        group: getGroup(),
        resource: data.resource,
        included: data.included
      })

      updateStore(response)

    } finally {
      loading.value = false
    }
  }

  const deleteResource = async () => {
    if (!resource.value) {
      throw new KError(KErrorCode.ScriptError, "No loaded resource to delete")
    }
    try {
      loading.value = true
      const id = resource.value.id
      // delete from server
      await service.delete({
        group: getGroup(),
        id
      })
      // remove from store
      store.remove(type, id)
      // clear local resource
      resourceId.value = null
    } finally {
      loading.value = false
    }
  }

  const immediate = toValue(options).immediate ?? true

  if (immediate) {
    watch(
      () => toValue(options),
      (options) => loadResource(options), 
      {immediate, deep: true}
    )
  }

  const load = async () => {
    return await loadResource(toValue(options))
  }

  return {
    resource,
    loading,
    load,
    update: updateResource,
    delete: deleteResource,
  }

}

/**
 * Creates a string that identifies this list filters for caching purposes.
 */
const buildQueryKey = (options: UseResourcesOptions) => {
  const params = new URLSearchParams()
  params.set("group", options.group)
  if (options.search) {
    params.set("search", options.search)
  }
  if (options.filter) {
    Object.entries(options.filter).map(([field, value]) => {
      if (Array.isArray(value)) {
        value = value.join(",");
      }
      params.set(`filter[${field}]`, value);
    });
  }
  if (options.sort) {
    params.set("sort", options.sort);
  }
  if (options.pageSize) {
    params.set("pageSize", options.pageSize.toString())
  }
  return params.toString()
}

export const useResources = <T extends ResourceObject>(type: string, options: MaybeRefOrGetter<UseResourcesOptions>) => {
  const store = useResourceStore()
  const service = getService<T>(type)

  // Create
  const creating = ref(false)

  const create = async (data: {
    resource: DeepPartial<T>,
    included?: (DeepPartial<ResourceObject> & ResourceIdentifierObject)[]
  }) => {
    const optionsVal = toValue(options)
    if (!("group" in optionsVal)) {
      throw new KError(KErrorCode.ScriptError, "Required group for this operation")
    }
    try {
      creating.value = true
      const response = await service.create({
        group: optionsVal.group,
        resource: data.resource,
        included: data.included
      })
      if (response.included) {
        store.setMany(response.included)
      }
      if (response.data !== null) {
        store.set(response.data)
      }
      return response.data
    } finally {
      creating.value = false
    }
  }

  // Get collection
  const loading = ref(false)
  const pageIndex = ref<number | null>(null)
  const queryKey = computed(() => buildQueryKey(toValue(options)))

  const resources = computed(() => {
    const rawResources = store.list<T>(type, queryKey.value)
    return rawResources?.map(r => enhanceResource(store, r))
  })

  const loadHelper = async (options: GetCollectionOptions, cache?: number) => {
    try {
      loading.value = true
      if (cache && store.isPageFresh(type, queryKey.value, pageIndex.value!, cache)) {
        return
      }
      const response = await service.list(options)
      if (response.included) {
        store.setMany(response.included)
      }
      if (response.data) {
        store.setPage(type, queryKey.value, pageIndex.value!, response)
      }
    } finally {
      loading.value = false
    }
  }

  const loadResources = async (options: UseResourcesOptions) => {
    pageIndex.value = 0
    await loadHelper(options, options.cache)
  }

  /**
   * The current page of resources, or null if page has not been loaded yet.
   */
  const page = computed(() => {
    return pageIndex.value === null ? null : (store.page(type, queryKey.value, pageIndex.value) ?? null)
  })

  /**
   * True if there is a next page. False if there is no next page. 
   * Undefined if we haven't loaded any page yet.
   */
  const hasNext = computed(() => {
    const next = page.value?.links.next
    return next === undefined ? undefined : next !== null
  })

  /**
   * True if there is a previous page. False if there is no previous page.
   * Undefined if we haven't loaded any page yet.
   */
  const hasPrev = computed(() => {
    const prev = page.value?.links.prev
    return prev === undefined ? undefined : prev !== null
  })

  const loadNextPage = async (options: UseResourcesOptions) => {
    if (hasNext.value === undefined || pageIndex.value === null || page.value === null) {
      throw new KError(KErrorCode.ScriptError, "Load next called before loading first page")
    }

    if (hasNext.value === false) {
      // No next page to fetch.
      return
    }
    
    pageIndex.value = pageIndex.value + 1

    await loadHelper({
      group: options.group,
      url: page.value.links.next!
    }, options.cache)
  }

  const loadPreviousPage = async (options: UseResourcesOptions) => {
    if (hasPrev.value === undefined || pageIndex.value === null || page.value === null) {
      throw new KError(KErrorCode.ScriptError, "Load previous called before loading first page")
    }

    if (hasPrev.value === false) {
      // No previous page to fetch.
      return
    }
    
    pageIndex.value = pageIndex.value - 1
    
    await loadHelper({
      group: options.group,
      url: page.value.links.prev!
    }, options.cache)
  }
  
  const immediate = toValue(options).immediate ?? true
  if (immediate) {
    watch(
      () => toValue(options),
      (options) => loadResources(options), 
      {immediate, deep: true}
    )
  }

  return {
    resources,
    
    creating,
    loading,
    hasNext,
    hasPrev,

    create,
    execute: () => loadResources(toValue(options)),
    loadNext: () => loadNextPage(toValue(options)),
    loadPrev: () => loadPreviousPage(toValue(options)),
  }
}