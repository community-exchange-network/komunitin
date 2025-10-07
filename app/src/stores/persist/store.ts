import { watch } from "vue"
import { getItem, persistItem, unpersistItem, isFresh } from "./storage"

const STORE_PREFIX = "store"

const storeKey = (storeId: string) => `${STORE_PREFIX}/${storeId}`

const loadStoreState = async <T>(storeId: string) => {
  const key = storeKey(storeId)
  const { value, timestamp } = await getItem<T>(key)
  if (timestamp && isFresh(timestamp)) {
    return value
  } else {
    await unpersistItem(key)
    return null
  }
}

const persistStoreState = async (storeId: string, state: unknown) => {
  const key = storeKey(storeId)
  await persistItem(key, state)
}

interface PersistStoreOptions<T> {
  id: string
  snapshot: () => T
  restore: (state: T) => void
}

export const usePersistStore = <T>({ id, snapshot, restore }: PersistStoreOptions<T>) => {
  let initialized = false
  let persistAfterInit = false

  const persistState = async () => {
    try {
      if (!initialized) {
        // Persist after initialization is complete.
        persistAfterInit = true
        return
      }
      const state = snapshot()
      await persistStoreState(id, state)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error persisting state:", error)
    }
  }

  const initState = async () => {
    try {
      // We preserve changes in the store made during the loading of the state.
      const emptyState = snapshot()
      const restored = await loadStoreState<Partial<T>>(id)
      if (restored) {
        const currentState = snapshot()
        for (const key in currentState) {
          if (currentState[key] === emptyState[key] && key in restored) {
            currentState[key] = restored[key]!
          }
        }
        restore(currentState)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error initializing state:", error)
    } finally {
      initialized = true
      if (persistAfterInit) {
        persistState()
      }
    }
  }

  watch(snapshot, persistState)
  initState()
}