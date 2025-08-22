import { useQuasar } from 'quasar'
import { MaybeRefOrGetter, ref, toValue, watchEffect } from 'vue'
import { KOptions } from '../../boot/koptions'
import { ErrorResponse, ResourceObject } from '../../store/model'
import { useStore } from 'vuex'

export interface Migration {
  id: string
  code: string
  name: string
  kind: "integralces-accounting"
  status: "new" | "started" | "completed" | "failed"
  data: {
    source: {
      url: string
      tokens: {
        refreshToken?: string
        accessToken: string
        expiresAt: string
      }
    }
  }
  created: string
  updated: string
}

export interface MigrationLogEntry {
  time: string, // ISO 8601 format
  level: "info" | "warn" | "error",
  message: string,
  step: string,
  //data?: any // Optional additional data
}

const baseUrl = ref(KOptions.url.accounting)

const useAuthFetch = () => { 
  const store = useStore()
  return async (url: string, options: RequestInit = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${store.getters.accessToken}`
      }
    })
    checkFetchError(response)
    try {
      return await response.json()
    } catch {
      // Empty or invalid json response.
      return null
    }
  }
}


export const useMigrations = (options: { immediate?: boolean, accountingBaseUrl?: string } = { immediate: true }) => {
  const q = useQuasar()
  const authFetch = useAuthFetch()

  const migrations = ref<Migration[]>([])
  const loading = ref(false)
  if (options.accountingBaseUrl) {
    baseUrl.value = options.accountingBaseUrl
  }
  

  const refresh = async () => {
    loading.value = true
    try {
      const data = await authFetch(`${baseUrl.value}/migrations`)
      
      migrations.value = data.data.map((m: ResourceObject) => {
        return {
          id: m.id,
          ...m.attributes,
        } as Migration
      })
    } catch {
      q.notify({ type: 'negative', message: 'Error loading migration data', position: 'top' })
    } finally {
      loading.value = false
    }
  }

  const create = async (migration: Partial<Migration>) => {
    const data = {
      data: {
        type: "migrations",
        attributes: {
          ...migration
        }
      }
    }
    const result = await authFetch(`${baseUrl.value}/migrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    // Redirect to the migration page.
    const migrationId = result.data.id

    q.notify({ type: 'positive', message: `Migration ${migration.code} created`, position: 'top' })
    return migrationId

  }

  const deleteMigration = async (migration: Migration) => {
    await authFetch(`${baseUrl.value}/migrations/${migration.id}`, {
      method: 'DELETE'
    });
    q.notify({ type: 'positive', message: `Migration ${migration.code} deleted`, position: 'top' })
  }

  if (options.immediate === undefined || options.immediate) {
    refresh()
  }

  return {
    baseUrl,
    migrations,
    loading,
    refresh,
    create,
    deleteMigration
  }
}

export const useMigration = (id: MaybeRefOrGetter<string>) => {
  const q = useQuasar()

  const migration = ref<Migration | null>(null)
  const log = ref<MigrationLogEntry[]>([])
  const loading = ref(false)


  let eventSource: EventSource | null = null
  const authFetch = useAuthFetch()

  const fetchMigration = async (id: string) => {
    loading.value = true
    try {
      const data = await authFetch(`${baseUrl.value}/migrations/${id}`)
      
      migration.value = {
        id: data.data.id,
        ...data.data.attributes,
      } as Migration

    } finally {
      loading.value = false
    }
  }

  const startLogStream = (id: string) => {
    // Close existing connection
    if (eventSource) {
      eventSource.close()
    }

    eventSource = new EventSource(`${baseUrl.value}/migrations/${id}/logs/stream`)

    eventSource.onmessage = (event) => {
      const logEntry: MigrationLogEntry = JSON.parse(event.data)
      // Avoid duplicates by checking if log entry already exists
      if (!log.value.find(l => l.time === logEntry.time && l.message === logEntry.message)) {
        log.value.push(logEntry)
      }
    }

    eventSource.onerror = () => {
      q.notify({ type: 'negative', message: 'Error connecting to migration log stream', position: 'top' })
    }
  }

  watchEffect(() => {
    const migrationId = toValue(id)
    if (migrationId) {
      fetchMigration(migrationId).then(() => {
        startLogStream(migrationId)
      })
    }
  })

  // Cleanup on component unmount
  const cleanup = () => {
    if (eventSource) {
      eventSource.close()
    }
  }

  const play = async () => {
    const migrationId = toValue(id)
    await authFetch(`${baseUrl.value}/migrations/${migrationId}/play`, {
      method: 'POST'
    })
    q.notify({ type: 'positive', message: `Migration ${migration.value?.code} started`, position: 'top' })
    await fetchMigration(migrationId)
  }

  return {
    migration,
    log,
    loading,
    play,
    cleanup
  }
}

export const getStatusColor = (state: string) => ({ new: 'blue', 'started': 'orange', completed: 'green', failed: 'red' }[state] ?? 'grey')
export const getStatusLabel = (state: string) => ({ new: 'New', 'started': 'In Progress', completed: 'Completed', failed: 'Failed' }[state] ?? state)


export const checkFetchError = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json() as ErrorResponse
    const errors = errorData.errors || []
    const details = errors.map((e) => e.title).join(', ')

    throw new Error(`Failed to fetch from "${response.url}".\nDetails: ${details}`)
  }
}