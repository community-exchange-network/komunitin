import { parse } from 'csv-parse/sync'
import { http, HttpResponse } from 'msw'
import { config } from '../../src/config'
import { encodeCsv } from '../../src/features/migrations/bundle/csv'
import type { MigrationBundleFilename } from '../../src/features/migrations/bundle/constants'
import { seedAccountingAccount, seedAccountingCurrency } from '../mocks/handlers'
import { server } from '../mocks/server'
import { toUuid } from '../mocks/utils'

export const timestamp = '2025-01-01T09:00:00.000Z'
export const ids = Object.fromEntries(['admin', 'alice', 'bob', 'group', 'alice-member', 'bob-member', 'category', 'offer', 'need', 'currency', 'alice-account', 'bob-account', 'membership'].map(key => [key, toUuid(`migration-${key}`)]))
export const passwordHash = '$S$D.0Je8nMSWL5H2iFL4a28/RH1EZiHy3igDMZT5av0zDqWWF9YXaZ'
const dateFields = { createdAt: timestamp, updatedAt: timestamp }
const csv = (rows: Record<string, string>[]) => {
  const columns = [...new Set(rows.flatMap(Object.keys))]
  return encodeCsv([columns, ...rows.map(row => columns.map(column => row[column] ?? ''))])
}
export const migrationFiles = () => new Map<MigrationBundleFilename, Buffer>([
  ['community.csv', csv([{
    id: ids.group, code: 'EXMP', name: 'Example', status: 'active', description: 'Imported community', access: 'public',
    adminUsers: 'admin@example.org', 'currency.id': ids.currency, ...dateFields,
    'settings.defaultGroupEmailFrequency': 'quarterly', imageUrl: 'https://images.test/community.png',
    'address.locality': 'Barcelona', 'address.country': 'ES',
  }])],
  ['users.csv', csv(['admin', 'alice', 'bob'].map(name => ({
    id: ids[name], email: `${name}@example.org`, name, language: 'ca', status: 'active', passwordHash, ...dateFields,
  })))],
  ['members.csv', csv(['alice', 'bob'].map(name => ({
    id: ids[`${name}-member`], code: name === 'alice' ? 'EXMP0001' : 'EXMP0002', name, type: 'personal',
    status: name === 'alice' ? 'active' : 'disabled', access: 'public', description: name, ...dateFields,
    'account.id': ids[`${name}-account`], imageUrl: name === 'alice' ? 'https://images.test/missing.png' : '',
  })))],
  ['member-users.csv', csv([
    { id: ids.membership, member: 'EXMP0001', user: 'alice@example.org', 'emails.group': 'daily', 'notifications.myAccount': 'false' },
    { member: 'EXMP0002', user: 'bob@example.org', 'emails.group': 'quarterly' },
  ])],
  ['categories.csv', csv([{ id: ids.category, code: 'food', name: 'Food', description: 'Local food', access: 'public', ...dateFields, 'icon.type': 'material', 'icon.value': 'restaurant' }])],
  ['posts.csv', csv([
    { id: ids.offer, code: 'bread', type: 'offer', member: 'EXMP0002', category: 'food', title: 'Bread', description: 'Fresh bread',
      status: 'published', access: 'public', value: '5 credits', ...dateFields,
      imageUrls: 'https://images.test/bread.png;https://images.test/missing.png;https://images.test/bread.png' },
    { id: ids.need, code: 'help', type: 'need', member: 'EXMP0001', description: 'Garden help', status: 'hidden', access: 'group',
      ...dateFields, fulfilledAt: '2025-02-01T09:00:00Z', expiresAt: '2025-03-01T09:00:00Z' },
  ])],
])
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z2ioAAAAASUVORK5CYII=', 'base64')

export const migrationMocks = () => {
  const identities = new Map<string, { id: string, email: string }>()
  const authImports: Record<string, string>[][] = []
  const downloads: string[] = []
  let missing = true
  let authGate: Promise<void> | undefined
  seedAccountingCurrency('EXMP', ids.currency)
  seedAccountingAccount('EXMP', 'EXMP0001', [ids.alice], ids['alice-account'])
  seedAccountingAccount('EXMP', 'EXMP0002', [ids.bob], ids['bob-account'], 'disabled')
  server.use(
    http.post(`${config.AUTH_URL}/migrations/users`, async ({ request }) => {
      if (request.headers.get('authorization') !== 'Bearer social-service-token') return new HttpResponse(null, { status: 401 })
      const rows = parse(await request.text(), { columns: true }) as Record<string, string>[]
      authImports.push(rows)
      await authGate
      return HttpResponse.json({ users: rows.map(row => {
        const existing = identities.get(row.email)
        const user = existing ?? { id: row.id || toUuid(row.email), email: row.email }
        identities.set(row.email, user)
        return { ...user, created: !existing }
      }), warnings: [] })
    }),
    http.get('https://images.test/:name', ({ request, params }) => {
      downloads.push(request.url)
      return missing && params.name === 'missing.png'
        ? new HttpResponse(null, { status: 404 })
        : new HttpResponse(tinyPng, { headers: { 'Content-Type': 'image/png' } })
    }),
  )
  return { authImports, downloads, fixImages: () => { missing = false }, pauseAuth: (gate: Promise<void>) => { authGate = gate } }
}

export const eventsFrom = (text: string) => text.split('\n\n').filter(block => block.includes('event: progress'))
  .map(block => JSON.parse(block.split('\n').find(line => line.startsWith('data: '))!.slice(6)))
