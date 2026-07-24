import TsJapi from 'ts-japi'
import { getResourceLink, SerializerOptions } from '../../server/jsonapi-serialize'
import { MemberSerializer } from '../members/serialize'
import type { SerializablePost } from './types'
import { CategorySerializer } from '../categories/serialize'

const { Relator, Linker, Serializer, PolymorphicSerializer } = TsJapi

const postProjection = {
  code: 1,
  title: 1,
  description: 1,
  images: 1,
  status: 1,
  access: 1,
  location: 1,
  expires: 1,
  created: 1,
  updated: 1,
} as const

const offerProjection = {
  ...postProjection,
  value: 1,
} as const

const needProjection = {
  ...postProjection,
  fulfilled: 1,
} as const

const linkers = {
  resource: new Linker((post: SerializablePost) => getResourceLink(post.type, post.tenantId, post.id)),
}

const relators = {
  member: new Relator(async (post: SerializablePost) => post.member, MemberSerializer, { relatedName: 'member' }),
  category: new Relator(async (post: SerializablePost) => post.category, CategorySerializer, { relatedName: 'category' })
}

const OfferSerializer = new Serializer('offers', {
  version: null,
  projection: offerProjection,
  linkers,
  relators
})

const NeedSerializer = new Serializer('needs', {
  version: null,
  projection: needProjection,
  linkers,
  relators
})

const PostSerializer = new PolymorphicSerializer('posts', 'type', {
  offers: OfferSerializer,
  needs: NeedSerializer,
})

export const serializePost = async (post: SerializablePost, options?: SerializerOptions<SerializablePost>) => {
  return PostSerializer.serialize(post, options as SerializerOptions<{type: any}>)
}

export const serializePosts = async (posts: SerializablePost[], options?: SerializerOptions<SerializablePost>) => {
  return PostSerializer.serialize(posts, options as SerializerOptions<{type: any}>)
}
