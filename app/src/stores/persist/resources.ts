import type { Ref } from "vue"
import type { PageIndexData, PageMap, ResourceMap, ResourceStore, TimestampMap } from "../resources"
import { ResourceObject } from "../../store/model"
import { 
  persistItem, 
  unpersistItem, 
  iterateStorage, 
  isInternalItem, 
  isFresh
} from "./storage"

const RESOURCES_PREFIX = "resources"
const PAGES_PREFIX = "pages"

export const resourceKey = (type: string, id: string) => `${RESOURCES_PREFIX}/${type}/${id}`
const isResourceKey = (key: string) => key.startsWith(RESOURCES_PREFIX + "/")

export const pageKey = (type: string, key: string, index: number) => `${PAGES_PREFIX}/${type}/${key}/${index}`
const isPageKey = (key: string) => key.startsWith(PAGES_PREFIX + "/")

export const loadResourceState = async () => {
  const state = {
    resources: {},
    pages: {},
    timestamps: {}
  } as Pick<ResourceStore["$state"], "resources" | "pages" | "timestamps">
  
  // Build state object
  await iterateStorage(async (key, value, timestamp) => {
    if (!isInternalItem(key)) {
      if (timestamp && isFresh(timestamp)) {
        if (isResourceKey(key)) {
          const [, type, id] = key.split("/")
          state.resources[type] = state.resources[type] || {}
          state.resources[type][id] = value as ResourceObject
          state.timestamps[key] = timestamp
        } else if (isPageKey(key)) {
          const [, type, queryKey, index] = key.split("/")
          state.pages[type] = state.pages[type] || {}
          state.pages[type][queryKey] = state.pages[type][queryKey] || []
          state.pages[type][queryKey][Number(index)] = value as PageIndexData
          state.timestamps[key] = timestamp
        }
        // otherwise may be a key from other store.
      } else {
        await unpersistItem(key)
      }
    }
  })

  return state
}

// add the entries in b to a, overwriting existing ones
const mergeMap = <T extends ResourceMap|PageMap>(a: T, b: T): T => {
  for (const type in b) {
    if (!(type in a)) {
      a[type] = b[type]
    } else {
      for (const key in b[type]) {
        // This is either resource objects or arrays of page index data. 
        // So we don't merge single pages.
        a[type][key] = b[type][key]
      }
    }
  }
  return a
}

export const usePersistResources = (state: {
  resources: Ref<ResourceMap>,
  pages: Ref<PageMap>,
  timestamps: Ref<TimestampMap>,
}) => {
  let initialized = false
  const persistAfterInit = [] as Array<() => Promise<void>>
  const initState = async () => {
    try {
      const restored = await loadResourceState()
      state.resources.value = mergeMap(restored.resources, state.resources.value)
      state.pages.value = mergeMap(restored.pages, state.pages.value)
      state.timestamps.value = { ...restored.timestamps, ...state.timestamps.value }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error initializing resources state:", error)
    } finally {
      initialized = true
    }
  }

  const persist = (key: string, value: unknown, keepTimestamp: boolean = false) => {
    const action = async () => {
      try {
        await persistItem(key, value, keepTimestamp)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error persisting resource state:", error)
      }
    }
    if (initialized) {
      action()
    } else {
      persistAfterInit.push(action)
    }
  }

  const unpersist = async (key: string) => {
    try {
      await unpersistItem(key)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error unpersisting resource state:", error)
    }
  }

  initState()

  return { persist, unpersist }
}