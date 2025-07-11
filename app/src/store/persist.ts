import { Store } from "vuex"
import localForage from "localforage"
import { ResourceObject } from "./model"
import { cloneDeep, merge } from "lodash-es"
import { toRaw } from "vue"

/**
 * Time in milliseconds for the expiration of the cached values.
 */
const EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30 // 30 days.

const DATABASE_NAME = "komunitin"

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
 * Removes all data from the persistent storage.
 * @param name The unique key for this database.
 */
export async function clearPersistedData() {
  const name = DATABASE_NAME
  await localForage.dropInstance({ name });
  await localForage.dropInstance({ name: name + "_timestamps" });
}

/**
 * Automatically update the state into persistent storage in every commit and restore the
 * state when executing this function at init.
 * 
 * In order for this plugin to properly work, the commit name must be the same as the state 
 * property, except for some special commits: addResources, addResource, removeResource and setPageIds.
 * 
 * @returns Vuex plugin.
 */
export default function createPersistPlugin<T>() {
  const name = DATABASE_NAME
  // Storage for actual values.
  const storage = localForage.createInstance({name})
  // Storage for timestamps of update time for values with the same key.
  const timestamps = localForage.createInstance({name: name + "_timestamps"})

  // Is this key a page ids value? /pages/key/index
  const isPage = (index: string[]) => index.length >= 3 && index[index.length-3] == 'pages'

  // Helper function to set the value in the proper place on the state tree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildState = (state: any, index: string[], value: any, end: number = index.length) => {
    let current = state;
    for (let i = 0; i < end; i++) {
      if (current[index[i]] === undefined) {
        // in last interation we set value instead of {}.
        current[index[i]] = (i < end - 1) ? {} : value
      }
      current = current[index[i]]
    }
    return current
  }


  return (store: Store<T>) => {
    // Restore state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state: any = {}
    const now = Date.now()

    iterateAsync(storage, async (value, key) => {
      const timestamp = await timestamps.getItem<number>(key)
      if (timestamp === null || timestamp + EXPIRATION_TIME < now) {
        if (timestamp !== null) {
          await timestamps.removeItem(key)
        }
        await storage.removeItem(key)
      } else {
        // Set the value in the state.
        const index = key.split('/');
        if (isPage(index)) {
          const current = buildState(state, index, [], index.length - 1)
          current[parseInt(index[index.length - 1])] = value
        } else {
          buildState(state, index, value)
        }
      }
    }).then(() => {
      store.replaceState(merge(store.state, state))
    })
    


    // Subscribe to mutations
    store.subscribe(({type, payload}) => {
      // Sometimes we get reactive objects here that are not being able to be stored by localForage.
      // The cloneDeep ensures no reactivity in the object hierarchy.
      const value = cloneDeep(payload)

      const parts = type.split("/")
      const index = parts.slice(0, parts.length - 1)
      const op = parts[parts.length - 1]
      
      // storage methods are asynchronous but we don't wait for the result (or error).
      const save = (i: string[], item: unknown) => {
        const key = i.join('/')
        storage.setItem(key, item).then(() => {
          // We set the timestamp after the value is saved so we never have an orphan timestamp.
          timestamps.setItem(key, Date.now())
        })
      }

      const remove = (i: string[]) => storage.removeItem(i.join('/'))
      if (op == 'addResources') {
        const resources = value as ResourceObject[]
        resources.forEach(resource => save([...index, 'resources', resource.id], toRaw(resource)))
      } else if (op == 'addResource') {
        const resource = value as ResourceObject
        save([...index, 'resources', resource.id], resource)
      } else if (op == 'setPageIds') {
        const {key, page, ids} = value as {key: string, page: number, ids: string[]}
        save([...index, 'pages', key, page + ""], ids)
      } else if (op == 'removeResource') {
        remove([...index, 'resources', value as string])
      } else {
        save([...index, op], value)
      }
    })
  }
}