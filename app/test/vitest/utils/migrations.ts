import { vi } from 'vitest'
import { config } from '../../../src/utils/config'
import type { Migration } from '../../../src/pages/superadmin/migrations'
import { Auth } from '../../../src/plugins/Auth'
import server from '../../../src/server'
import { mockToken } from '../../../src/server/AuthServer'

/** Serve one successful migration through the real HTTP and SSE boundaries. */
export const mockMigrations = ({ expiredToken = false } = {}) => {
  const migration: Migration = {
    id: '77777777-7777-4777-8777-777777777777', code: 'BRAM', status: 'completed',
    created: '2026-10-07T10:00:00.000Z', updated: '2026-10-07T10:01:00.000Z', finished: '2026-10-07T10:01:00.000Z',
  }
  const events = [
    ['migration', { id: migration.id }],
    ['progress', { id: 1, created: migration.finished, step: 'complete', message: 'Community import completed', level: 'info' }],
    ['end', { id: migration.id, status: migration.status }],
  ].map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
  const originalFetch = globalThis.fetch

  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, options) => {
    const url = String(input)
    let response: Response
    if (expiredToken && url === `${config.AUTH_URL}/token`) {
      expiredToken = false
      response = new Response(JSON.stringify(mockToken(Auth.SCOPES, {
        superadmin: true, userId: server.schema.first('user').id,
      })))
    } else if (!url.startsWith(`${config.SOCIAL_URL}/migrations`)) {
      response = await originalFetch(input, options)
    } else if (expiredToken) {
      response = new Response(JSON.stringify({ errors: [{ code: 'Unauthorized', title: 'Unauthorized' }] }), { status: 401 })
    } else if (options?.method === 'POST' || url.endsWith('/events')) {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(events))
          controller.close()
        },
      })
      // Mirage's Response polyfill has no streaming body support.
      response = Object.defineProperty(new Response(null, { headers: { 'Content-Type': 'text/event-stream' } }), 'body', { value: body })
    } else {
      response = new Response(JSON.stringify(migration))
    }
    return response
  })
}
