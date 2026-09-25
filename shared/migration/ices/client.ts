import { z } from 'zod'
import { MAX_MIGRATION_DATA_ROWS } from '../../../social/src/features/migrations/bundle/constants'

const identifierSchema = z.object({ type: z.string(), id: z.string() })
const linkSchema = z.union([z.string(), z.object({ href: z.string() })]).nullable()
const resourceSchema = identifierSchema.extend({
  attributes: z.record(z.string(), z.unknown()),
  relationships: z.record(z.string(), z.object({
    data: z.union([identifierSchema, z.array(identifierSchema)]).nullable().optional(),
  })).default({}),
})
const documentSchema = z.object({
  data: z.union([resourceSchema, z.array(resourceSchema)]),
  included: z.array(resourceSchema).default([]),
  links: z.object({ next: linkSchema.optional() }).optional(),
})

export type IcesResource = z.infer<typeof resourceSchema>
export type IcesDocument = z.infer<typeof documentSchema>
export type IcesAuth = { email: string, password: string }

export const identifiers = (resource: IcesResource, relationship: string) => {
  const data = resource.relationships[relationship]?.data
  return data ? Array.isArray(data) ? data : [data] : []
}

export const includedResources = (document: IcesDocument, resource: IcesResource, relationship: string) =>
  identifiers(resource, relationship).map((identifier) => {
    const included = document.included.find(({ type, id }) => type === identifier.type && id === identifier.id)
    if (!included) throw new Error(`ICES omitted included ${relationship} for ${resource.type}/${resource.id}`)
    return included
  })

/** ICES has different endpoint, include and pagination contracts from the new Social API. */
export class IcesClient {
  private readonly baseUrl: URL
  private token = ''
  private expiresAt = 0

  constructor(url: string, private readonly auth: IcesAuth, readonly pageSize = 100) {
    this.baseUrl = new URL(url.endsWith('/') ? url : `${url}/`)
    if (!['http:', 'https:'].includes(this.baseUrl.protocol) || this.baseUrl.username
      || this.baseUrl.password || this.baseUrl.search || this.baseUrl.hash) {
      throw new Error('ICES URL must be an HTTP(S) site URL without credentials, query or fragment')
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
      throw new Error('ICES page size must be between 1 and 1000')
    }
  }

  private async request(url: URL, init: RequestInit) {
    const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`ICES ${url.pathname} returned HTTP ${response.status}`)
    return response.json() as Promise<unknown>
  }

  private async accessToken() {
    if (Date.now() >= this.expiresAt) {
      const json = await this.request(new URL('oauth2/token', this.baseUrl), {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: 'komunitin-app',
          username: this.auth.email,
          password: this.auth.password,
          // Site admins need read-all access to export other users' settings.
          scope: 'komunitin_social komunitin_social_read_all',
        }),
      })
      const result = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).safeParse(json)
      if (!result.success) throw new Error('ICES returned an invalid OAuth token response')
      this.token = result.data.access_token
      this.expiresAt = Date.now() + Math.max(0, result.data.expires_in - 30) * 1000
    }
    return this.token
  }

  async document(path: string, query: Record<string, string> = {}) {
    const url = new URL(`ces/api/social/${path}`, this.baseUrl)
    url.search = new URLSearchParams(query).toString()
    const json = await this.request(url, {
      headers: { Authorization: `Bearer ${await this.accessToken()}`, Accept: 'application/vnd.api+json' },
    })
    const result = documentSchema.safeParse(json)
    if (!result.success) throw new Error(`ICES ${url.pathname} returned an invalid JSON:API document`)
    return result.data
  }

  async *pages(path: string, query: Record<string, string>) {
    let after = 0
    const seen = new Set<string>()
    let more: boolean
    do {
      const document = await this.document(path, {
        ...query, 'page[size]': String(this.pageSize), 'page[after]': String(after),
      })
      const resources = collection(document)
      for (const resource of resources) {
        const key = `${resource.type}/${resource.id}`
        if (seen.has(key)) throw new Error(`ICES repeated ${key} during pagination; retry with source writes paused`)
        seen.add(key)
      }
      yield document
      const next = document.links?.next
      more = next !== null && next !== undefined
      if (more) {
        // ICES emits public URLs even when accessed internally. Only read the offset;
        // keep the configured origin, endpoint and filters, and never forward tokens to links.
        const href = typeof next === 'string' ? next : next!.href
        const cursor = new URL(href, this.baseUrl).searchParams.get('page[after]')
        const offset = Number(cursor)
        if (!cursor || !Number.isSafeInteger(offset) || offset !== after + this.pageSize || resources.length === 0) {
          throw new Error(`ICES returned invalid pagination for ${path}`)
        }
        after = offset
      }
    } while (more)
  }

  /** ICES sorts posts only by modified time and ignores sort parameters. Offset
   * pages can lose rows on ties, so expand a prefix until it contains every row. */
  async posts(path: string, query: Record<string, string>) {
    let size = this.pageSize
    let document: IcesDocument
    let more: boolean
    do {
      document = await this.document(path, { ...query, 'page[size]': String(size), 'page[after]': '0' })
      const resources = collection(document)
      more = document.links?.next !== null && document.links?.next !== undefined
      if (more && (resources.length !== size || size > MAX_MIGRATION_DATA_ROWS)) {
        throw new Error(`ICES cannot return a complete ${path} collection within the migration row limit`)
      }
      size = Math.min(size * 2, MAX_MIGRATION_DATA_ROWS + 1)
    } while (more)
    return document
  }
}

export const collection = (document: IcesDocument) => {
  if (!Array.isArray(document.data)) throw new Error('Expected an ICES collection')
  return document.data
}

export const single = (document: IcesDocument) => {
  if (Array.isArray(document.data)) throw new Error('Expected a single ICES resource')
  return document.data
}
