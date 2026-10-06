import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'
import { MIGRATION_BUNDLE_FILENAMES, MAX_MIGRATION_DATA_ROWS, type MigrationBundleFilename } from '../../../../social/src/features/migrations/bundle/constants'
import { encodeCsv, CSV_HEADERS } from '../../../../social/src/features/migrations/bundle/csv'
import type { MigrationSummary } from '../../../../social/src/features/migrations/bundle/types'
import { collection, identifiers, includedResources, IcesClient, single, type IcesAuth, type IcesDocument, type IcesResource } from './client'
import type { IcesRows } from './bundle'
import { parseMigrationBundle } from '../../../../social/src/features/migrations/bundle'

export interface IcesExportOptions {
  /** ICES site root, for example https://ices.example.org (not the Social API URL). */
  url: string
  code: string
  auth: IcesAuth
  pageSize?: number
  /** Per-request timeout, including the response body. Defaults to 120 seconds. */
  timeoutMs?: number
  /** Receive progress messages without changing the exported bundle. */
  onProgress?: (message: string) => void
  /** Sanitize source rows before resolving UUID references to CSV emails. */
  sanitize?: (rows: IcesRows) => void
}

export interface IcesExportResult {
  bytes: Buffer
  summary: MigrationSummary
  warnings: string[]
}

type Row = Record<string, string>
const cell = (value: unknown): string => {
  if (value !== null && value !== undefined && !['string', 'number', 'boolean'].includes(typeof value)) {
    throw new Error('ICES returned a structured value where a CSV scalar was expected')
  }
  return value === null || value === undefined ? '' : String(value)
}

const attribute = (resource: IcesResource, path: string) => {
  let value: unknown = resource.attributes
  for (const key of path.split('.')) {
    value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  }
  return value
}

const fields = (resource: IcesResource, columns: Record<string, string>): Row =>
  Object.fromEntries(Object.entries(columns).map(([column, path]) => [column, cell(attribute(resource, path))]))

const profileColumns = {
  code: 'code', name: 'name', description: 'description', access: 'access',
  createdAt: 'created', updatedAt: 'updated', imageUrl: 'image',
  'address.streetAddress': 'address.streetAddress', 'address.locality': 'address.addressLocality',
  'address.postalCode': 'address.postalCode', 'address.region': 'address.addressRegion',
  'address.country': 'address.addressCountry',
  'location.type': 'location.type', 'location.longitude': 'location.coordinates.0',
  'location.latitude': 'location.coordinates.1',
}

const requireType = (resource: IcesResource, type: string) => {
  if (resource.type !== type) throw new Error(`Expected ICES ${type}, received ${resource.type}`)
}

const related = (resource: IcesResource, relationship: string, type: string, required = true) => {
  const refs = identifiers(resource, relationship)
  if (refs.length > 1 || (required && refs.length !== 1) || refs.some((ref) => ref.type !== type)) {
    throw new Error(`ICES ${resource.type}/${resource.id} has an invalid ${relationship} relationship`)
  }
  return refs[0]?.id ?? ''
}

const settings = (document: IcesDocument, resource: IcesResource, type: string) => {
  related(resource, 'settings', type)
  return includedResources(document, resource, 'settings')[0]
}

const contacts = (document: IcesDocument, resource: IcesResource): Row => {
  const row: Row = {}
  for (const contact of includedResources(document, resource, 'contacts')) {
    requireType(contact, 'contacts')
    const type = cell(contact.attributes.type)
    const column = `contact.${type}`
    if (!CSV_HEADERS['members.csv'].includes(column)) {
      throw new Error(`ICES ${resource.type}/${resource.id} has an unsupported contact type: ${type}`)
    }
    // The bundle has one column per contact type; keep the first source value.
    if (!(column in row)) row[column] = cell(contact.attributes.name)
  }
  return row
}

const preferences = (resource: IcesResource) => fields(resource, {
  'notifications.myAccount': 'notifications.myAccount', 'notifications.group': 'notifications.group',
  'emails.myAccount': 'emails.myAccount', 'emails.group': 'emails.group',
})

/** Export one community through the legacy API to the common CSV bundle format. */
export const createIcesMigrationBundle = async (options: IcesExportOptions): Promise<IcesExportResult> => {
  const client = new IcesClient(options.url, options.auth, options.pageSize, options.onProgress, options.timeoutMs)
  return exportBundle(client, options.code, options.sanitize)
}

/** List every community state and reuse one authenticated client across bundles. */
export async function* createAllIcesMigrationBundles(options: Omit<IcesExportOptions, 'code'>) {
  const client = new IcesClient(options.url, options.auth, options.pageSize, options.onProgress, options.timeoutMs)
  let completed = 0
  for await (const document of client.pages('groups', { 'filter[status]': 'pending,active,disabled' })) {
    for (const community of collection(document)) {
      requireType(community, 'groups')
      const code = cell(community.attributes.code)
      yield { code, ...await exportBundle(client, code, options.sanitize) }
      client.onProgress(`Completed ${++completed} communities`)
    }
  }
}

const exportBundle = async (client: IcesClient, code: string, sanitize?: IcesExportOptions['sanitize']): Promise<IcesExportResult> => {
  if (!/^[A-Z0-9]{4}$/.test(code)) throw new Error('ICES community code must be four uppercase letters or digits')
  client.onProgress(`Exporting community ${code}`)
  const rows = Object.fromEntries(MIGRATION_BUNDLE_FILENAMES.map((file) => [file, [] as Row[]])) as Record<MigrationBundleFilename, Row[]>
  const warnings = new Set([
    'ICES exposes only the first owner of each member through filter[members]. Additional shared-account owners and identities without a member or community administrator relationship cannot be discovered through this API.',
  ])
  const warn = (message: string) => {
    warnings.add(message)
    client.onProgress(`Warning: ${message}`)
  }
  let rowCount = 0
  const add = (file: MigrationBundleFilename, row: Row) => {
    if (++rowCount > MAX_MIGRATION_DATA_ROWS) throw new Error('ICES export exceeds the migration bundle row limit')
    rows[file].push(row)
  }
  const users = new Map<string, Row>()
  const addUser = (document: IcesDocument, user: IcesResource) => {
    requireType(user, 'users')
    const userSettings = settings(document, user, 'user-settings')
    const row: Row = { id: user.id, email: cell(user.attributes.email).trim().toLowerCase(), language: cell(userSettings.attributes.language) }
    if (!users.has(user.id)) {
      users.set(user.id, row)
      add('users.csv', row)
    } else if (users.get(user.id)!.email !== row.email) {
      throw new Error(`ICES user ${user.id} changed during export; retry with source writes paused`)
    }
    return { row, preferences: preferences(userSettings) }
  }

  const communityDocument = await client.document(code, { include: 'contacts,settings,admins,admins.settings' })
  const community = single(communityDocument)
  requireType(community, 'groups')
  if (community.attributes.code !== code) throw new Error('ICES returned a different community')
  const communitySettings = settings(communityDocument, community, 'group-settings')
  const admins = includedResources(communityDocument, community, 'admins').map((user) => addUser(communityDocument, user).row.id)
  if (admins.length === 0) throw new Error('ICES did not expose any community administrators')
  const communityRow: Row = {
    ...fields(community, profileColumns), ...contacts(communityDocument, community),
    id: community.id, 'currency.id': related(community, 'currency', 'currencies', false),
    status: cell(community.attributes.status), adminUsers: [...new Set(admins)].join(';'),
  }
  // Older groups keep their website in an attribute rather than a contact.
  communityRow['contact.website'] ||= cell(community.attributes.website)
  for (const column of CSV_HEADERS['community.csv'].filter((column) => column.startsWith('settings.'))) {
    communityRow[column] = cell(attribute(communitySettings, column.slice('settings.'.length)))
  }
  add('community.csv', communityRow)

  const members = new Map<string, string>()
  for await (const document of client.pages(`${code}/members`, {
    include: 'contacts', sort: 'code', 'filter[state]': 'draft,pending,active,disabled,suspended,deleted',
  })) {
    const page = collection(document)
    // Keep each owner query unambiguous, but bound concurrent reads to avoid
    // thousands of serial round trips on large legacy communities.
    for (let offset = 0; offset < page.length; offset += 8) {
      const batch = page.slice(offset, offset + 8)
      const ownerDocuments = await Promise.all(batch.map(member => client.document('users', {
        'filter[members]': member.id, include: 'settings',
      })))
      for (const [index, member] of batch.entries()) {
        const userDocument = ownerDocuments[index]
        const owners = collection(userDocument)
        if (owners.length !== 1) throw new Error(`ICES did not expose the owner of member ${member.id}; use a social_read_all service token`)
        requireType(member, 'members')
        if (related(member, 'group', 'groups') !== community.id) throw new Error('ICES returned a member from another community')
        const row: Row = {
          ...fields(member, profileColumns), ...contacts(document, member), id: member.id,
          type: cell(member.attributes.type), status: cell(member.attributes.state),
          'account.id': related(member, 'account', 'accounts', false),
        }
        members.set(member.id, row.code)
        add('members.csv', row)
        const owner = addUser(userDocument, owners[0])
        add('member-users.csv', { member: row.code, user: owner.row.id, ...owner.preferences })
        client.onProgress(`${code}: ${members.size} members, ${users.size} unique users exported`)
      }
    }
  }

  // ICES returns every category at once and may incorrectly advertise a next page.
  const categoryDocument = await client.document(`${code}/categories`)
  const categories = new Map<string, string>()
  for (const category of collection(categoryDocument)) {
    requireType(category, 'categories')
    const row: Row = { id: category.id, ...fields(category, {
      code: 'code', name: 'name', description: 'description', access: 'access',
      createdAt: 'created', updatedAt: 'updated', 'icon.type': 'icon.type', 'icon.value': 'icon.value',
    }) }
    categories.set(category.id, row.code)
    add('categories.csv', row)
  }

  for (const type of ['offers', 'needs'] as const) {
    const document = await client.posts(`${code}/${type}`, {
      'filter[state]': 'published,hidden', 'filter[expired]': 'true,false',
    })
    for (const post of collection(document)) {
      requireType(post, type)
      const memberId = related(post, 'member', 'members')
      const categoryId = related(post, 'category', 'categories', false)
      if (!members.has(memberId)) {
        warn(`ICES ${type}/${post.id} references member ${memberId} missing from exported community ${code}; skipping post`)
        continue
      }
      if (categoryId && !categories.has(categoryId)) {
        warn(`ICES ${type}/${post.id} references category ${categoryId} missing from exported community ${code}; exporting without a category`)
      }
      const images = post.attributes.images
      if (!Array.isArray(images) || images.some((image) => typeof image !== 'string' || image.includes(';'))) {
        throw new Error(`ICES ${type}/${post.id} has images that cannot be represented as a CSV URL list`)
      }
      const row: Row = {
        id: post.id, ...fields(post, {
          code: 'code', description: 'content', status: 'state', access: 'access',
          createdAt: 'created', updatedAt: 'updated', expiresAt: 'expires',
        }),
        type: type === 'offers' ? 'offer' : 'need', member: members.get(memberId)!,
        category: categories.get(categoryId) ?? '', imageUrls: images.join(';'),
        ...(type === 'offers' ? fields(post, { title: 'name', value: 'price' }) : {}),
      }
      // ICES encodes its unset expiry sentinel as the Unix epoch.
      if (row.expiresAt === '1970-01-01T00:00:00Z') row.expiresAt = ''
      add('posts.csv', row)
    }
  }

  // Retain the exact owner until sanitization has resolved duplicate identities.
  sanitize?.(rows)
  const emails = new Map(rows['users.csv'].map(row => [row.id, row.email]))
  communityRow.adminUsers = [...new Set(communityRow.adminUsers.split(';').map(id => emails.get(id)!))].join(';')
  for (const row of rows['member-users.csv']) row.user = emails.get(row.user)!
  client.onProgress(`${code}: creating ZIP`)
  const zip = new ZipFile()
  for (const file of MIGRATION_BUNDLE_FILENAMES.filter((file) => file !== 'transfers.csv')) {
    client.onProgress(`${code}: ${file}: ${rows[file].length} rows`)
    const headers = rows[file].length === 0 ? CSV_HEADERS[file]
      : CSV_HEADERS[file].filter((header) => rows[file].some((row) => row[header]))
    zip.addBuffer(encodeCsv([headers, ...rows[file].map((row) => headers.map((header) => row[header] ?? ''))]), file)
  }
  const contents = buffer(zip.outputStream)
  zip.end()
  const bytes = await contents
  if (sanitize) {
    const validation = await parseMigrationBundle({ type: 'zip', bytes })
    if (!validation.success) {
      throw new Error(`Sanitized ICES bundle is invalid: ${validation.errors.map(error =>
        `${error.file}:${error.row}:${error.column} ${error.code}`).join('; ')}`)
    }
  }
  client.onProgress(`${code}: ZIP ready (${bytes.length} bytes)`)
  const summary: MigrationSummary = {
    users: rows['users.csv'].length,
    memberUsers: rows['member-users.csv'].length,
    members: rows['members.csv'].length,
    accounts: 0,
    transfers: 0,
    categories: rows['categories.csv'].length,
    offers: rows['posts.csv'].filter((row) => row.type === 'offer').length,
    needs: rows['posts.csv'].filter((row) => row.type === 'need').length,
    images: [communityRow, ...rows['members.csv']].filter((row) => row.imageUrl).length
      + rows['posts.csv'].reduce((count, row) => count + (row.imageUrls ? row.imageUrls.split(';').length : 0), 0),
  }
  return { bytes, summary, warnings: [...warnings] }
}
