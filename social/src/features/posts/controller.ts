import type { RequestHandler } from 'express'
import { getAuthContext, getOptionalAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCollectionParams, getCode, getIdParam, getResourceParams } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import type { CreatePostBody, PatchPostBody } from './schema'
import { serializePost, serializePosts } from './serialize'
import { createPost, deletePost, getPost, listPosts, patchPost } from './service'
import { CreatePostInput } from './types'

export const getPostsRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const params = getCollectionParams(req, {
    filter: ['code', 'type', 'status', 'access', 'member', 'category', 'expired', 'search'],
    sort: ['created', 'updated', 'expires', 'distance'],
    include: [
      'member',
      'member.group',
      'member.group.currency',
      'member.account',
      'category',
    ],
    near: true,
  })

  const posts = await listPosts(ctx, code, params)

  const payload = await serializePosts(
    posts,
    getCollectionSerializerOptions(req.url, params, posts.length)
  )

  res.status(200).json(payload)
}

export const getPostRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const postId = getIdParam(req, 'post')
  const params = getResourceParams(req, {
    include: [
      'member',
      'member.group',
      'member.group.currency',
      'member.account',
      'category',
    ],
  })

  const post = await getPost(ctx, code, postId, params)

  const payload = await serializePost(post, params)
  res.status(200).json(payload)
}

export const postPostsRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const body = getValidatedBody<CreatePostBody>(req)

  const categoryId = body.data.relationships.category?.data?.id ?? null
  const memberId = body.data.relationships.member.data.id
  
  const data = {
    ...body.data.attributes,
    type: body.data.type,
    categoryId,
    memberId,
  } as CreatePostInput

  const post = await createPost(ctx, code, data)

  const payload = await serializePost(post)
  res.status(201).json(payload)
}

export const patchPostRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const postId = getIdParam(req, 'post')
  const body = getValidatedBody<PatchPostBody>(req)

  const categoryId = body.data.relationships?.category?.data?.id ?? (
    body.data.relationships?.category !== undefined ? null : undefined
  )

  const post = await patchPost(ctx, code, postId, {
    ...body.data.attributes,
    type: body.data.type,
    categoryId,
  })

  const payload = await serializePost(post)
  res.status(200).json(payload)
}

export const deletePostRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const postId = getIdParam(req, 'post')

  await deletePost(ctx, code, postId)
  res.status(204).send()
}
