import { useQuasar } from 'quasar'
import type { MaybeRefOrGetter} from 'vue';
import { ref, toValue, watchEffect } from 'vue'
import type { CollectionResponse, ResourceObject, ResourceResponse } from '../../store/model'
import { useApiFetch } from '../../composables/useApiFetch';

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
    },
    test?: boolean
    step?: string
  }
  created: string
  updated: string
}

type MigrationResource = ResourceObject & {
  attributes: Omit<Migration, "id">
}

export interface MigrationLogEntry {
  time: string, // ISO 8601 format
  level: "info" | "warn" | "error",
  message: string,
  step: string,
  //data?: any // Optional additional data
}

const getDefaultAccountingUrl = () => {
  const currentLocation = window.location
  if (currentLocation.hostname === 'localhost') {
    return 'http://localhost:2025'
  } else {
    return `${currentLocation.protocol}//accounting.${currentLocation.host}`
  }
}

const baseUrl = ref(getDefaultAccountingUrl())




export const useMigrations = (options: { immediate?: boolean} = { immediate: true }) => {
  const q = useQuasar()
  const apiFetch = useApiFetch<MigrationResource>()

  const migrations = ref<Migration[]>([])
  const loading = ref(false)

  const refresh = async () => {
    loading.value = true
    try {
      const data = await apiFetch(`${baseUrl.value}/migrations`) as CollectionResponse<MigrationResource>
      
      migrations.value = data.data.map((m: MigrationResource) => {
        return {
          id: m.id,
          ...m.attributes,
        } as Migration
      })

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
    const result = await apiFetch(`${baseUrl.value}/migrations`, {
      method: 'POST',
      body: data
    }) as ResourceResponse<MigrationResource>

    // Redirect to the migration page.
    const migrationId = result.data.id

    q.notify({ type: 'positive', message: `Migration ${migration.code} created`, position: 'top' })
    return migrationId

  }

  const deleteMigration = async (migration: Migration) => {
    await apiFetch(`${baseUrl.value}/migrations/${migration.id}`, {
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
  const apiFetch = useApiFetch<MigrationResource>()

  const fetchMigration = async (id: string) => {
    loading.value = true
    try {
      const data = await apiFetch(`${baseUrl.value}/migrations/${id}`) as ResourceResponse<MigrationResource>
      
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
    await apiFetch(`${baseUrl.value}/migrations/${migrationId}/play`, {
      method: 'POST'
    })
    q.notify({ type: 'positive', message: `Migration ${migration.value?.code} started`, position: 'top' })
    await fetchMigration(migrationId)
  }

  const update = async (updated: Partial<Migration>) => {
    if (!migration.value) {
      throw new Error('No migration loaded')
    }
    if (updated.id && updated.id !== migration.value.id) {
      throw new Error('Cannot change migration id')
    }
    if (updated.code && updated.code !== migration.value.code) {
      throw new Error('Cannot change migration code')
    }
    if (updated.kind && updated.kind !== migration.value.kind) {
      throw new Error('Cannot change migration kind')
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {id, data, name, code } = updated
    const body = {
      data: {
        type: "migrations",
        id: migration.value.id,
        attributes: {
          name,
          code,
          data,
        }
      }
    }
    await apiFetch(`${baseUrl.value}/migrations/${migration.value.id}`, {
      method: 'PATCH',
      body
    });

    q.notify({ type: 'positive', message: `Migration ${migration.value.code} updated`, position: 'top' })
    return migration.value.id

  }

  return {
    migration,
    log,
    loading,
    update,
    play,
    cleanup
  }
}

export const getStatusColor = (state: string) => 
  ({ new: 'blue', 'started': 'orange', completed: 'green', failed: 'red' }[state] ?? 'grey')
export const getStatusLabel = (state: string) => 
  ({ new: 'New', 'started': 'In Progress', completed: 'Completed', failed: 'Failed' }[state] ?? state)
