import { useQuasar } from 'quasar'
import { MaybeRefOrGetter, ref, toValue, watchEffect } from 'vue'
import { KOptions } from '../../boot/koptions'
import { ErrorResponse, ResourceObject } from '../../store/model'

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

export const useMigrations = (options: { immediate?: boolean } = {immediate: true}) => {
  const q = useQuasar()

  const migrations = ref<Migration[]>([])
  const loading = ref(false)

  const refresh = async () => {
    loading.value = true
    try {
      const response = await fetch(`${baseUrl.value}/migrations`)
      chechFetchError(response)
      const data = await response.json()
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
    const response = await fetch(`${baseUrl.value}/migrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    chechFetchError(response)

    const result = await response.json()
    // Redirect to the migration page.
    const migrationId = result.data.id

    q.notify({ type: 'positive', message: `Migration ${migration.code} created`, position: 'top' })
    return migrationId

  }

  if (options.immediate === undefined || options.immediate) {
    refresh()
  }
  
  return {
    baseUrl,
    migrations,
    loading,
    refresh,
    create
  }
}

export const useMigration = (id: MaybeRefOrGetter<string>) => {
  const q = useQuasar()
  const migration = ref<Migration | null>(null)
  const log = ref<MigrationLogEntry[]>([])
  const loading = ref(false)
  
  
  let eventSource: EventSource | null = null

  const fetchMigration = async (id: string) => {
    loading.value = true
    try {
      const response = await fetch(`${baseUrl.value}/migrations/${id}`)
      chechFetchError(response)
      const data = await response.json()
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
    const response = await fetch(`${baseUrl.value}/migrations/${migrationId}/play`, {
      method: 'POST',
    })
    chechFetchError(response)
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

export const getStatusColor = (state: string) => ({ new: 'blue', 'in-progress': 'orange', completed: 'green' }[state] ?? 'grey')
export const getStatusLabel = (state: string) => ({ new: 'New', 'in-progress': 'In Progress', completed: 'Completed' }[state] ?? state)


export const chechFetchError = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json() as ErrorResponse
    const errors = errorData.errors || []
    const details = errors.map((e) => e.title).join(', ')
    
    throw new Error(`Failed to fetch from "${response.url}".\nDetails: ${details}`)
  }
}