import localForage from "localforage"
import { major, minor } from "semver"

/**
 * Time in milliseconds for the expiration of the cached values.
 */
export const EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30 // 30 days.

const DATABASE_NAME = "komunitin"
const CURRENT_VERSION = process.env.APP_VERSION ?? "0.0.0"

const INTERNAL_PREFIX = "_"

const storage = localForage.createInstance({ name: DATABASE_NAME })
const timestamps = localForage.createInstance({ name: DATABASE_NAME + "_timestamps" })

const setInternalItem = async (key: string, value: string) => {
  await storage.setItem(INTERNAL_PREFIX + key, value)
}

const getInternalItem = async (key: string) => {
  return await storage.getItem<string>(INTERNAL_PREFIX + key)
}

export const isInternalItem = (key: string) => {
  return key.startsWith(INTERNAL_PREFIX)
}

export const isFresh = (timestamp: number | null): timestamp is number => {
  return timestamp !== null && timestamp + EXPIRATION_TIME >= Date.now()
}

/**
 * Save a value in the storage with the given key and set its timestamp.
 */
export const persistItem = async (key: string, value: unknown, keepTimestamp: boolean = false) => {
  if (key.startsWith("_")) {
    throw new Error("Cannot set a cache item starting with '_'.")
  }
  await storage.setItem(key, value)
  // Set the timestamp after the value is saved so we never have an orphan timestamp.
  const timestamp = await timestamps.getItem(key)
  if (!timestamp || !keepTimestamp) {
    await timestamps.setItem(key, Date.now())
  }
}

/**
 * Remove a value from the storage and its timestamp.
 */
export const unpersistItem = async (key: string) => {
  const timestamp = await timestamps.getItem<number>(key)
  if (timestamp !== null) {
    await timestamps.removeItem(key)
  }
  await storage.removeItem(key)
}

/**
 * Get an item with its value and timestamp.
 */
export const getItem = async <T>(key: string): Promise<{ value: T | null, timestamp: number | null }> => {
  const [value, timestamp] = await Promise.all([
    storage.getItem<T>(key),
    timestamps.getItem<number>(key)
  ])
  return { value, timestamp }
}

/**
 * Iterate over all values in the storage and call the async callback function for each one. This
 * function does not wait for each iteration step to complete before starting the next one.
 * 
 * You can't directly call the storage.iterate method with an async callback because it will
 * stop the iteration since the async callback returns a promise which is a non-undefined value.
 */
const iterateAsync = async (storage: LocalForage, callback: (value: unknown, key: string) => Promise<void>) => {
  return new Promise<void>((resolve, reject) => {
    let n = 0
    const checkEnd = () => {
      if (--n == 0) {
        // n == 0 means that there is no value being processed and the iteration is finished.
        resolve()
      }
    }
    n++ // Start iteration
    storage.iterate((value, key) => {
      n++ // Start process value
      callback(value, key)
        .catch(reject)
        .finally(checkEnd) // End process value
    })
      .then(checkEnd) // End iteration
      .catch(reject)
  })
}

/**
 * Iterate over all storage items, providing value, key, and timestamp for each.
 */
export const iterateStorage = async (callback: (key: string, value: unknown, timestamp: number | null) => Promise<void>) => {
  return iterateAsync(storage, async (value, key) => {
    const timestamp = await timestamps.getItem<number>(key)
    await callback(key, value, timestamp)
  })
}

/**
 * Clear all stored data if there is a breaking upgrade.
 */
const checkBreakingUpgrade = async () => {
  const existingVersion = (await getInternalItem("version")) ?? "0.0.0"
  const breaking = major(existingVersion) !== major(CURRENT_VERSION) || minor(existingVersion) !== minor(CURRENT_VERSION)
  if (breaking) {
    if (process.env.DEV) {
      // eslint-disable-next-line no-console
      console.log(`Breaking upgrade detected from ${existingVersion} to ${CURRENT_VERSION}. Clearing persisted data.`)
    }
    await storage.clear()
    await timestamps.clear()
  }
  await setInternalItem("version", CURRENT_VERSION)
}

// Check for breaking code upgrade at module load time.
checkBreakingUpgrade().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Error checking for breaking upgrade:", error)
})