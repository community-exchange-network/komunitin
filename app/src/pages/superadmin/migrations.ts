import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import KError from '../../KError'
import { useRawApiFetch } from '../../composables/useApiFetch'
import { config } from '../../utils/config'

export interface Migration {
  id: string
  code: string | null
  status: 'running' | 'completed' | 'failed'
  created: string
  updated: string
  finished: string | null
}

export interface MigrationLogEntry {
  id: number
  created: string
  level: 'info' | 'warn' | 'error'
  message: string
  step: string
}

type MigrationEvent =
  | { event: 'migration', data: { id: string } }
  | { event: 'progress', data: MigrationLogEntry }
  | { event: 'end', data: { id: string, status: Migration['status'] } }

/** Social owns the attempt status and combines progress from all migration phases. */
const useMigrationRequest = () => {
  const apiFetch = useRawApiFetch()
  return (path = '', options: RequestInit = {}) => apiFetch(`${config.SOCIAL_URL}/migrations${path}`, options)
}

/** Read Social's named SSE events across arbitrary network chunks. */
async function* migrationEvents(response: Response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      pending += decoder.decode(value, { stream: true })
      let boundary: number
      while ((boundary = pending.indexOf('\n\n')) !== -1) {
        const lines = pending.slice(0, boundary).split('\n')
        pending = pending.slice(boundary + 2)
        const event = lines.find(line => line.startsWith('event: '))?.slice(7)
        const data = lines.find(line => line.startsWith('data: '))?.slice(6)
        if (data) yield { event, data: JSON.parse(data) } as MigrationEvent
      }
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
}

export const useMigrations = () => {
  const request = useMigrationRequest()
  const migrations = ref<Migration[]>([])
  const loading = ref(false)
  const error = ref('')
  const refresh = async () => {
    loading.value = true
    error.value = ''
    try {
      migrations.value = await (await request()).json() as Migration[]
    } catch (cause) {
      error.value = KError.getKError(cause).message
    } finally {
      loading.value = false
    }
  }
  void refresh()
  return { migrations, loading, error, refresh }
}

export const useMigration = (id: MaybeRefOrGetter<string>) => {
  const request = useMigrationRequest()
  const migration = ref<Migration | null>(null)
  const log = ref<MigrationLogEntry[]>([])
  const loading = ref(false)
  const error = ref('')
  const revision = ref(0)
  const step = computed(() => log.value.at(-1)?.step ?? 'Not started')
  const refresh = () => { revision.value++ }

  watch([() => toValue(id), revision], async ([migrationId], _previous, onCleanup) => {
    const abort = new AbortController()
    onCleanup(() => abort.abort())
    migration.value = null
    log.value = []
    error.value = ''
    loading.value = true
    const readStatus = async () => {
      const result = await (await request(`/${migrationId}`, { signal: abort.signal })).json() as Migration
      if (!abort.signal.aborted) migration.value = result
    }
    try {
      await readStatus()
      if (abort.signal.aborted) return
      loading.value = false
      const response = await request(`/${migrationId}/events`, { signal: abort.signal })
      let ended = false
      for await (const event of migrationEvents(response)) {
        if (abort.signal.aborted) break
        if (event.event === 'progress') {
          const previousStep = step.value
          log.value.push(event.data)
          if (previousStep !== event.data.step) await readStatus()
        } else if (event.event === 'end') {
          ended = true
          await readStatus()
          break
        }
      }
      if (!ended && !abort.signal.aborted) throw new Error('Progress connection interrupted. Refresh to reconnect; the migration may still be running.')
    } catch (cause) {
      if (!abort.signal.aborted) error.value = KError.getKError(cause).message
    } finally {
      if (!abort.signal.aborted) loading.value = false
    }
  }, { immediate: true })

  return { migration, log, loading, error, step, refresh }
}

/** Upload once, then observe the accepted attempt on its details page. */
export const useMigrationUpload = () => {
  const request = useMigrationRequest()
  const running = ref(false)
  const error = ref('')
  const abort = new AbortController()
  onScopeDispose(() => abort.abort())
  const upload = async (bundle: File) => {
    running.value = true
    error.value = ''
    let id: string | undefined
    try {
      const response = await request('', {
        method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: bundle, signal: abort.signal,
      })
      for await (const event of migrationEvents(response)) {
        if (event.event === 'migration') {
          id = event.data.id
          break
        }
      }
      if (!id) throw new Error('Upload connection interrupted. Check migration history before uploading again.')
    } catch (cause) {
      if (!abort.signal.aborted) error.value = KError.getKError(cause).message
    } finally {
      running.value = false
    }
    return id
  }
  return { upload, running, error }
}

export const getStatusColor = (state: Migration['status']) =>
  ({ running: 'orange', completed: 'green', failed: 'red' }[state])
export const getStatusLabel = (state: Migration['status']) =>
  ({ running: 'In Progress', completed: 'Completed', failed: 'Failed' }[state])
