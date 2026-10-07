import server from '@/server'
import type { Offer } from '@/store/model'

/** Add a post using the seeded member, group and category. */
export const createPost = (type: 'offers' | 'needs', code: string, attributes: Partial<Offer['attributes']> = {}) =>
  server.schema.create('post', {
    ...server.schema.first('post').attrs,
    id: undefined,
    type,
    code,
    title: code,
    description: code,
    updated: new Date().toISOString(),
    ...attributes
  })
