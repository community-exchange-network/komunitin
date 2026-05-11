import TsJapi from 'ts-japi'
import { Post } from './types'
import { SerializerOptions } from '../../server/jsonapi-serialize'
import { config } from '../../config'
import { MemberSerializer } from '../members/serialize'

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
  resource: new Linker((post) => `${config.API_BASE_URL}/${post.tenantId}/posts/${post.id}`),
}

const relators = {
  member: new Relator(async (post: Post) => post.member, MemberSerializer),
  category: new Relator(async (post: Post) => ({id: post.categoryId}), new Serializer("categories"))
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