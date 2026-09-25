import { createServer } from 'node:http'
import { once } from 'node:events'
import { text } from 'node:stream/consumers'
import type { TestContext } from 'node:test'

export const icesId = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
const ref = (type: string, id: number) => ({ type, id: icesId(id) })
const relation = (type: string, id: number) => ({ data: ref(type, id) })
const resource = <R extends object = Record<string, never>>(
  type: string, id: number, attributes: Record<string, unknown>, relationships: R = {} as R,
) =>
  ({ ...ref(type, id), attributes, relationships })
const dates = { created: '2025-01-01T00:00:00Z', updated: '2025-02-01T00:00:00Z' }

/** HTTP fixture follows the Drupal serializers and their collection quirks. */
export const serveIces = async (t: TestContext) => {
  const userSettings = Array.from({ length: 6 }, (_, index) => resource('user-settings', 100 + index, {
    language: 'ca', notifications: { myAccount: true, group: false },
    emails: { myAccount: false, group: index === 1 ? 'daily' : 'quarterly' }, komunitin: true,
  }))
  const users = userSettings.map((_, index) => resource('users', 200 + index, { email: `user${index}@example.org` }, {
    settings: relation('user-settings', 100 + index),
    // The legacy User serializer can list memberships outside the selected community.
    members: { data: [ref('members', 9999)] },
  }))
  const groupSettings = resource('group-settings', 10, {
    requireAdminApproval: true, requireAcceptTerms: true, terms: 'Terms, with a "quote"\nand a new line',
    minOffers: '1', minNeeds: 0, allowAnonymousMemberList: false,
    enableGroupEmail: true, defaultGroupEmailFrequency: 'monthly',
  })
  const group = resource('groups', 1, {
    ...dates, code: 'ICES', name: 'Legacy community', description: '', access: 'public', status: 'disabled',
    image: null, website: 'https://example.org',
    address: { addressLocality: 'Manresa', addressRegion: 'Bages', addressCountry: 'ES' },
    location: { type: 'Point', coordinates: [1.82, 41.72] },
  }, {
    currency: relation('currencies', 2) as { data: ReturnType<typeof ref> | null }, settings: relation('group-settings', 10),
    admins: { data: [ref('users', 200)] }, contacts: { data: [] },
  })
  const groups = [group]
  const states = ['draft', 'pending', 'active', 'disabled', 'suspended', 'deleted']
  const contacts = states.map((_, index) => resource('contacts', 400 + index, {
    type: 'email', name: `member${index}@example.org`, ...dates,
  }))
  const members = states.map((state, index) => resource('members', 300 + index, {
    ...dates, code: `ICES000${index}`, name: `Member ${index}`, type: 'personal', state,
    description: null, access: 'group', image: 'https://example.org/avatar.jpg',
    address: { streetAddress: 'Carrer, 1', postalCode: '00000' },
    location: { type: 'Point', coordinates: [0, 0] },
  }, {
    group: relation('groups', 1), contacts: { data: [ref('contacts', 400 + index)] },
    account: index < 2 ? { data: null } : relation('accounts', 500 + index),
  }))
  const socialContact = resource('contacts', 499, { type: 'twitter', name: '@legacy', ...dates })
  members[0].relationships.contacts.data.push(ref('contacts', 499))
  const categories = [0, 1].map((index) => resource('categories', 600 + index, {
    ...dates, code: `category-${index}`, name: `Category ${index}`, description: null,
    access: 'group', icon: index === 0 ? { type: 'material', value: 'home' } : null, cpa: null,
  }, { group: relation('groups', 1) }))
  const posts = [0, 1, 2].map((index) => resource('offers', 700 + index, {
    ...dates, code: `offer-${index}`, name: `Title ${index}`, content: 'Description, "quoted"\nnext line',
    price: '2 hours', state: index === 0 ? 'hidden' : 'published', access: 'group',
    expires: index === 2 ? '1970-01-01T00:00:00Z' : '2025-03-01T00:00:00Z',
    images: ['https://example.org/a.jpg', 'https://example.org/a.jpg'],
  }, { member: relation('members', index === 1 ? 305 : 302), category: relation('categories', 600) }))
  const needs = [resource('needs', 800, {
    ...dates, code: 'need', content: 'Need content', state: 'hidden', access: 'group',
    expires: '2025-03-01T00:00:00Z', images: [],
  }, { member: relation('members', 302), category: { data: null } })]
  const requests: Array<{ url: URL, authorization: string | undefined, body: string }> = []
  const overrides = new Map<string, (url: URL) => { status?: number, body: unknown }>()
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, 'http://fixture')
    requests.push({ url, authorization: request.headers.authorization, body: await text(request) })
    response.setHeader('Content-Type', 'application/vnd.api+json')
    const override = overrides.get(url.pathname)?.(url)
    let body: unknown
    if (override) {
      response.statusCode = override.status ?? 200
      body = override.body
    } else if (url.pathname === '/drupal/oauth2/token') {
      body = { access_token: 'fixture-token', expires_in: 3600 }
    } else if (groups.some((group) => url.pathname === `/drupal/ces/api/social/${group.attributes.code}`)) {
      body = { data: groups.find((group) => url.pathname.endsWith(`/${group.attributes.code}`)),
        included: [groupSettings, users[0], userSettings[0]] }
    } else if (url.pathname === '/drupal/ces/api/social/users') {
      const index = members.findIndex(({ id }) => id === url.searchParams.get('filter[members]'))
      // The first two members share an owner. Admin user 0 has no membership.
      const owner = Math.max(1, index)
      body = { data: [users[owner]], included: [userSettings[owner]], links: { next: 'http://public.example/ignored' } }
    } else {
      const type = url.pathname.split('/').at(-1)!
      const source = { groups, members, categories, offers: posts, needs }[type]
      const data = type === 'groups' || url.pathname.includes('/ICES/') ? source : source && []
      if (data) {
        const after = Number(url.searchParams.get('page[after]') ?? 0)
        const size = Number(url.searchParams.get('page[size]') ?? 2)
        const page = type === 'categories' ? data : data.slice(after, after + size)
        const next = new URL(url.pathname, 'https://public.example')
        next.searchParams.set('page[after]', String(after + size))
        body = { data: page, included: type === 'members' ? [...contacts.slice(after, after + size), socialContact] : [],
          links: { next: page.length === size ? { href: next.href } : null } }
      } else {
        response.statusCode = 404
        body = { errors: [{ title: 'Unexpected endpoint' }] }
      }
    }
    response.end(JSON.stringify(body))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server address')
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())))
  return { url: `http://127.0.0.1:${address.port}/drupal`, requests, overrides, group, groups, members, posts, users, userSettings, contacts, categories, socialContact }
}
