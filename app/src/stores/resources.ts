import { defineStore } from "pinia";
import { ResourceObject } from "../store/model";
import { ref } from "vue";
import { resourceKey, pageKey, usePersistResources } from "./persist";

export type PageIndexData = {
  ids: string[]
  next?: string | null
  prev?: string | null
}

export type ResourcePageData = {
  data: ResourceObject[]
  links: {
    next?: string | null
    prev?: string | null
  }
}
export type ResourceStore = ReturnType<typeof useResourceStore>

export type ResourceMap = Record<string, Record<string, ResourceObject>>
export type PageMap = Record<string, Record<string, PageIndexData[]>>
export type TimestampMap = Record<string, number>

/**
 * Pinia store to manage all JSON:API resources in a single store.
 * This store provides O(1) access to resources by type and id, as well as
 * methods to find resources by attributes or relationships, and to manage
 * paginated lists of resources.
 */
export const useResourceStore = defineStore("resources", () => {
  // STATE
  /**
   * Dictionary of resources indexed by [type][id].
   */
  const resources = ref<ResourceMap>({})
  /**
   * Queried object ids. Concretely:
   * pages[type][query][page] = [id1, id2, ...]
   */
  const pages = ref<PageMap>({})
  /**
   * Dictionary of timestamps when a resource was last fetched.
   * The keys are the strings "resources/:type/:id" or "pages/:type/:key/:index".
   * 
   * Note that the persist plugin has its own timestamps and cache 
   * invalidation mechanism.
   */
  const timestamps = ref<TimestampMap>({})

  const {persist, unpersist} = usePersistResources({
    resources,
    pages,
    timestamps
  })

  // GETTERS
  const get = <T extends ResourceObject>(type: string, id: string): T | null => (resources.value[type]?.[id] as T) || null

  const find = <T extends ResourceObject>(
    type: string, 
    conditions: Partial<T["attributes"]> & Record<keyof T["relationships"], string>
  ) => {
    const items = resources.value[type]
    if (!items) {
      return null
    }
    const targets = Object.values(items).filter((resource: ResourceObject) =>
      Object.entries(conditions).every(
        ([field, value]) => {
          if (resource.attributes && field in resource.attributes) {
            return resource.attributes[field] == value;
          } else if (resource.relationships && field in resource.relationships) {
            // Check that the relationship is defined and is to-one.
            const rel = resource.relationships[field].data
            // Note that rel can only be null, an array or an object (ResourceIdentifier).
            return rel && !Array.isArray(rel) && rel.id == value;
          }
          return false
        }
      ))
    // In the case we have more than one resource meeting the criteria, 
    // we return the last one. This may help in cases where this function is used
    // to find inverse one-to-one relationships that just changed, because the Object.values()
    // order is the insertion order so we'll get the most updated object.
    return targets.length > 0 ? targets.pop() : null;
  }
  const page = <T extends ResourceObject>(type: string, key: string, index: number): ResourcePageData | undefined => {
    const page = pages.value[type]?.[key]?.[index]
    if (!page) {
      return undefined
    }
    return {
      data: page.ids.map(id => get(type, id) as T),
      links: {
        next: page.next,
        prev: page.prev
      }
    }
  }
  const list = <T extends ResourceObject>(type: string, key: string): T[] | undefined => {
    return pages.value[type]?.[key]?.flatMap(page => page.ids.map(id => get(type, id) as T))
  }

  // SETTERS

  const set = <T extends ResourceObject>(resource: T) => {
    if (!(resource.type in resources.value)) {
      resources.value[resource.type] = {}
    }
    resources.value[resource.type][resource.id] = resource
    const key = resourceKey(resource.type, resource.id)
    timestamps.value[key] = Date.now()
    persist(key, resource)
  }

  const setMany = <T extends ResourceObject>(resources: T[]) => {
    resources.forEach(set)
  }

  const remove = (type: string, id: string) => {
    const resKey = resourceKey(type, id)
    delete timestamps.value[resKey]
    delete resources.value[type][id]
    unpersist(resKey)

    // remove from pages
    if (type in pages.value) {
      for (const key in pages.value[type]) {
        const keyPages = pages.value[type][key]
        let afterDelete = false
        for (let i = 0; i < keyPages.length; i++) {
          // Remove the id from the page
          if (keyPages[i].ids.includes(id)) {
            keyPages[i].ids = keyPages[i].ids.filter(itemId => itemId !== id)
            afterDelete = true
          }
          // From the altered page onwards, shift one id to the left.
          if (afterDelete) {
            if (i < keyPages.length - 1 && keyPages[i + 1].ids.length > 0) {
              keyPages[i].ids.push(keyPages[i + 1].ids.shift() as string)
            }
            persist(pageKey(type, key, i), keyPages[i], true)
          }
          // Next and prev links remain the same. Actually they could change
          // in theory but we actually know they are based in offset/limit and
          // hence only depend on the number of items, not on which items. 
          // Otherwise we'd need to delete all subsequent pages after 
          // deletion of an element.
        }
      }
    }
  }
  
  /**
   * Sets a page of resources for a given type and query key. It sets both the
   * list of resource ids for that page, as well as the resources themselves.
   * 
   * @param type 
   * @param queryKey 
   * @param index 
   * @param page 
   */
  const setPage = (type: string, queryKey: string, index: number, page: ResourcePageData) => {
    const pageIndex = {
      ids: page.data.map(r => r.id),
      next: page.links.next,
      prev: page.links.prev
    }
    if (!(type in pages.value)) {
      pages.value[type] = {}
    }
    if (!(queryKey in pages.value[type])) {
      pages.value[type][queryKey] = []
    }
    pages.value[type][queryKey][index] = pageIndex

    const key = pageKey(type, queryKey, index)
    timestamps.value[key] = Date.now()
    
    persist(key, pageIndex)

    setMany(page.data)
  }

  const isFresh = (type: string, id: string, time: number) => {
    const timestamp = timestamps.value[resourceKey(type, id)]
    return timestamp && timestamp + time > Date.now()
  }

  const isPageFresh = (type: string, key: string, index: number, time: number) => {
    const timestamp = timestamps.value[pageKey(type, key, index)]
    return timestamp && timestamp + time > Date.now()
  }

  return {
    // State
    resources,
    pages,
    timestamps,
    // Getters functions
    get,
    find,
    page,
    list,
    isFresh,
    isPageFresh,
    // Setters
    set,
    setMany,
    remove,
    setPage
  }
})

/*
export const useResourceTypeStore = <T extends ResourceObject>(type: string) => {
  const store = useResourcesStore()
  return {
    get: (id: string) => store.get<T>(type, id),
    find: (conditions: Partial<T["attributes"]> & Record<keyof T["relationships"], string>) => store.find<T>(type, conditions),
    page: (key: string, index: number) => store.page<T>(type, key, index),
    list: (key: string) => store.list<T>(type, key),
    set: store.set,
    setMany: store.setMany,
    remove: (id: string) => store.remove(type, id),
    setPage: (key: string, page: number, ids: string[]) => store.setPage(type, key, page, ids)
  }
}
export type ResourceTypeStore<T extends ResourceObject> = ReturnType<typeof useResourceTypeStore<T>>
*/