import { defineStore } from "pinia";
import { ResourceObject } from "../store/model";
import { ref } from "vue";

export const useResourceType = <T extends ResourceObject>(type: string) => {
  const store = useResourcesStore()
  return {
    get: (id: string) => store.get<T>(type, id),
    find: (conditions: Partial<T["attributes"]> & Record<keyof T["relationships"], string>) => store.find<T>(type, conditions),
    page: (key: string, index: number) => store.page<T>(type, key, index),
    list: (key: string) => store.list<T>(type, key),
    set: (resource: T) => store.set(resource),
    setMany: (resources: T[]) => store.setMany(resources),
    remove: (id: string) => store.remove(type, id),
    setPage: (key: string, page: number, ids: string[]) => store.setPage(type, key, page, ids)
  }
}

export const useResourcesStore = defineStore("resources", () => {
  // STATE
  /**
   * Dictionary of resources indexed by [type][id].
   */
  const resources = ref<Record<string, Record<string, ResourceObject>>>({})
  /**
   * Queried object ids. Concretely:
   * pages[type][query][page] = [id1, id2, ...]
   */
  const pages = ref<Record<string, Record<string, string[][]>>>({})
  /**
   * Dictionary of timestamps when a resource was last fetched.
   * The keys are the strings "resources/:type/:id" or "pages/:type/:key/:index".
   * 
   * Note that the persist plugin has its own timestamps and cache 
   * invalidation mechanism.
   */
  const timestamps = ref<Record<string, number>>({})

  // GETTERS
  const get = <T extends ResourceObject>(type: string, id: string) => resources.value[type]?.[id] as T || null

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
  const page = <T extends ResourceObject>(type: string, key: string, index: number): T[] | undefined => {
    return pages.value[type]?.[key]?.[index]?.map(id => get(type, id) as T)
  }
  const list = <T extends ResourceObject>(type: string, key: string): T[] | undefined => {
    return pages.value[type]?.[key]?.flatMap(page => page.map(id => get(type, id) as T))
  }

  // SETTERS
  const resourceKey = (type: string, id: string) => `resources/${type}/${id}`
  const pageKey = (type: string, key: string, index: number) => `pages/${type}/${key}/${index}`

  const set = <T extends ResourceObject>(resource: T) => {
    if (!(resource.type in resources.value)) {
      resources.value[resource.type] = {}
    }
    resources.value[resource.type][resource.id] = resource
    timestamps.value[resourceKey(resource.type, resource.id)] = Date.now()
  }

  const setMany = <T extends ResourceObject>(resources: T[]) => {
    resources.forEach(set)
  }

  const remove = (type: string, id: string) => {
    delete timestamps.value[resourceKey(type, id)]
    delete resources.value[type][id]
  }
  
  const setPage = (type: string, key: string, page: number, ids: string[]) => {
    if (!(type in pages.value)) {
      pages.value[type] = {}
    }
    if (!(key in pages.value[type])) {
      pages.value[type][key] = []
    }
    pages.value[type][key][page] = ids
    timestamps.value[pageKey(type, key, page)] = Date.now()
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
    // Setters
    set,
    setMany,
    remove,
    setPage
  }
})
