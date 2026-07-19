import TsJapi from 'ts-japi'
import { getResourceLink, SerializerOptions } from '../../server/jsonapi-serialize'
import { MemberSerializer } from '../members/serialize'
import { Post } from './types'
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
  resource: new Linker((post: Post) => getResourceLink(post.type, post.tenantId, post.id)),
}

const relators = {
  member: new Relator(async (post: Post) => post.member, MemberSerializer, { relatedName: 'member' }),
  category: new Relator(async (post: Post) => post.category, CategorySerializer, { relatedName: 'category' })
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

export const serializePost = async (post: Post, options?: SerializerOptions<Post>) => {
  return PostSerializer.serialize(post, options as SerializerOptions<{type: any}>)
}

export const serializePosts = async (posts: Post[], options?: SerializerOptions<Post>) => {
  return PostSerializer.serialize(posts, options as SerializerOptions<{type: any}>)
}
