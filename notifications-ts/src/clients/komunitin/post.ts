import type { Need, Offer } from './types'

export type ExpiringPost<T extends Offer | Need = Offer | Need> = T & {
  attributes: T['attributes'] & {
    expires: string
  }
}

export const hasExpiration = <T extends Offer | Need>(post: T): post is ExpiringPost<T> =>
  post.attributes.expires !== null

export const isExpired = (post: Offer | Need) =>
  hasExpiration(post) && new Date(post.attributes.expires).getTime() <= Date.now()
