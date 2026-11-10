import { openAsBlob } from 'node:fs'
import { parseCredentialArgs, publicApiUrl, responseError, userToken } from '../utils.ts'

/** Upload a bundle and print its durable SSE progress log. */
export const migrateSocial = async (args: string[]) => {
  const { values, positionals } = parseCredentialArgs(args)
  const filename = positionals[0] ?? process.env.MIGRATION_BUNDLE
  if (!filename || positionals.length > 1) throw new Error('Usage: komunitin admin migrate <bundle.zip> [--email <email>] [--password <password>]')
  const bundle = await openAsBlob(filename, { type: 'application/zip' })
  const token = await userToken(values, 'superadmin')
  if (!token.scope.split(' ').includes('superadmin')) throw new Error('The supplied user is not a superadmin')
  const response = await fetch(new URL('/migrations', publicApiUrl('KOMUNITIN_SOCIAL_URL')), {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/zip' }, body: bundle,
  })
  if (!response.ok) throw new Error(`Migration upload failed: ${await responseError(response)}`)
  const id = response.headers.get('x-migration-id')
  console.log(`Migration ${id}. Disconnecting this CLI does not stop the migration.`)
  if (!response.body) throw new Error('Missing migration progress stream')
  let pending = ''
  let status: string | undefined
  const decoder = new TextDecoder()
  for await (const chunk of response.body) {
    pending += decoder.decode(chunk, { stream: true })
    let end: number
    while ((end = pending.indexOf('\n\n')) !== -1) {
      const lines = pending.slice(0, end).split('\n')
      pending = pending.slice(end + 2)
      const event = lines.find(line => line.startsWith('event: '))?.slice(7)
      const data = lines.find(line => line.startsWith('data: '))?.slice(6)
      if (!data) continue
      const value = JSON.parse(data)
      if (event === 'progress') console.log(`${value.created} [${value.level}] ${value.step}: ${value.message}${Object.keys(value.data).length ? ` ${JSON.stringify(value.data)}` : ''}`)
      if (event === 'end') status = value.status
    }
  }
  if (!status) throw new Error(`Progress stream disconnected. Inspect GET /migrations/${id} or /migrations/${id}/events before retrying.`)
  if (status !== 'completed') throw new Error(`Migration ${id} ${status}. Resolve reported conflicts and re-upload the bundle to retry.`)
  console.log(`Migration ${id} completed.`)
}
