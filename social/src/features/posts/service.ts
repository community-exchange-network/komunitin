import z from 'zod'
import type { Post as DbPost, Member as DbMember } from '../../generated/prisma/client'
import { PostUpdateInput } from '../../generated/prisma/models'
import type { AuthContext, OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { orderBySort, whereFilter } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { slugify } from '../../utils/format'
import prisma from '../../utils/prisma'
import { fromLocation, getGroupByCode, isGroupAdmin, isGroupMember, toLocation } from '../groups/service'
import type { Group } from '../groups/types'
import { getMember, isMemberUser, toMember } from '../members/service'
import type { PostStatus } from './schema'
import type { CreatePostInput, NeedData, OfferData, PatchPostInput, Post } from './types'

const toPost = (dbPost: DbPost & {member: DbMember}): Post => {
  const { latitude, longitude, data, member, ...post} = dbPost
  const location = toLocation({
    address: null,
    latitude: dbPost.latitude,
    longitude: dbPost.longitude,
  })
  const dataObj = typeof data === 'object' && data !== null ? data : {}
  return {
    ...post,
    ...dataObj,
    location,
    member: toMember(member)
  } as Post
}

const getPostById = async (code: string, id: string): Promise<Post> => {
  const validation = z.uuid().safeParse(id)
  if (!validation.success) {
    throw notFound('Post not found')
  }

  const db = tenantDb(prisma, code)
  const post = await db.post.findFirst({
    where: { id, deleted: null },
    include: {
      member: true
    }
  })

  if (!post) {
    throw notFound('Post not found')
  }

  return toPost(post)
}

const isPostOwner = async (ctx: OptionalAuthContext, post: Post): Promise<boolean> => {
  return await isMemberUser(ctx, { id: post.memberId, tenantId: post.tenantId })
}

const canReadPost = async (ctx: OptionalAuthContext, group: Group, post: Post): Promise<boolean> => {
  return (ctx.isSuperadmin) 
    || (post.access === 'public' && post.status === 'published')
    || (post.access === 'group' && post.status === 'published' && await isGroupMember(ctx, group))
    || (await isPostOwner(ctx, post))
    || (await isGroupAdmin(ctx, group))
}

const canWritePost = async (ctx: AuthContext, group: Group, post: Post): Promise<boolean> => {
  return ctx.isSuperadmin
    || await isGroupAdmin(ctx, group)
    || await isPostOwner(ctx, post)
}

const validateStatusTransition = async (
  ctx: AuthContext,
  group: Group,
  post: Post,
  to: PostStatus,
): Promise<void> => {
  const from = post.status
  if (from === to) return

  const admin = ctx.isSuperadmin || await isGroupAdmin(ctx, group)
  const owner = await isPostOwner(ctx, post)

  if (from === 'draft' && to === 'published' && (owner || admin)) return
  if (from === 'published' && to === 'hidden' && (owner || admin)) return
  if (from === 'hidden' && to === 'published' && (owner || admin)) return

  throw badRequest('Status transition is not allowed')
}

const findFreePostCode = async (code: string, baseCode: string): Promise<string> => {
  const db = tenantDb(prisma, code)
  let uniqueCode = baseCode
  let suffix = 2
  
  while (true) {
    const existing = await db.post.findFirst({ where: { code: uniqueCode } })
    if (!existing) {
      return uniqueCode
    }
    uniqueCode = `${baseCode}-${suffix}`
    suffix++
  }
}

export const listPosts = async (ctx: OptionalAuthContext, code: string, params: CollectionParams): Promise<Post[]> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)
  const filterWhere = whereFilter(params.filters)

  const posts = await db.post.findMany({
    where: {
      ...filterWhere,
      deleted: null,
    },
    include: {
      member: true
    },
    orderBy: orderBySort(params.sort),
  })

  const visiblePosts: Post[] = []
  for (const dbPost of posts) {
    const post = toPost(dbPost)
    if (await canReadPost(ctx, group, post)) {
      visiblePosts.push(post)
    }
  }

  return visiblePosts.slice(params.pagination.cursor, params.pagination.cursor + params.pagination.size)
}

export const getPost = async (ctx: OptionalAuthContext, code: string, id: string): Promise<Post> => {
  const group = await getGroupByCode(ctx, code)
  const post = await getPostById(code, id)

  const allowed = await canReadPost(ctx, group, post)
  if (!allowed) {
    throw forbidden('You do not have permission to read this post')
  }

  return post
}

const makeTitleFromDescription = (description: string, maxLength: number = 50): string => {
  const lines = description.trim().split('\n')
  if (lines.length === 0) {
    return ""
  }
  const title = lines[0].trim()

  if (title.length <= maxLength) {
    return title
  }

  const lastSpace = title.lastIndexOf(' ', maxLength)
  const clip = lastSpace > 0 ? lastSpace : maxLength
  return title.substring(0, clip) + '…'
}

const extractPostTypeData = (input: PatchPostInput, post?: Post): OfferData | NeedData  => {
  if (input.type === 'offers') {
    const data = post && post.type === 'offers' ? { value: post.value } : { value: null }
    if (input.value !== undefined) {
      data.value = input.value?.trim() || null
    }
    delete input.value
    return data
  } else {
    const data = post && post.type === 'needs' ? { fulfilled: post.fulfilled } : { fulfilled: null }
    if (input.fulfilled !== undefined) {
      data.fulfilled = input.fulfilled ? new Date(input.fulfilled) : null
    }
    delete input.fulfilled
    return data
  }
}

export const createPost = async (ctx: AuthContext, code: string, input: CreatePostInput): Promise<Post> => {
  const db = tenantDb(prisma, code)

  const group = await getGroupByCode(ctx, code)

  // Resolve member
  const member = await getMember(ctx, code, input.memberId)
  if (!member) {
    throw badRequest('Member not found')
  }

  // Check access
  const allowed = ctx.isSuperadmin 
    || await isMemberUser(ctx, member)  
    || await isGroupAdmin(ctx, group)
  
  if (!allowed) {
    throw forbidden('You do not have permission to create a post for this member')
  }

  // Resolve category
  if (input.categoryId) {
    const category = await db.category.findFirst({ where: { 
      id: input.categoryId,
      group: { id: group.id }
    } })
    if (!category) {
      throw badRequest('Category not found')
    }
  }

  // Default title
  const title = input.title?.trim() || makeTitleFromDescription(input.description)

  // Default code
  const baseCode = input.code ?? slugify(title)
  const postCode = await findFreePostCode(code, baseCode)

  // Default to member's location if not provided
  const location = input.location ?? member.location
  const coords = fromLocation(location)

  const expires = input.expires ? new Date(input.expires) : null

  // Build type-specific data object
  const data = extractPostTypeData(input)

  const created = await db.post.create({
    data: {
      type: input.type,
      code: postCode,
      title: title,
      description: input.description ?? '',
      images: input.images,
      status: input.status ?? 'draft',
      access: input.access ?? 'public',
      latitude: coords.latitude,
      longitude: coords.longitude,
      expires,  
      data,
      memberId: member.id,
      categoryId: input.categoryId ?? null,
      groupId: group.id,
    },
    include: {
      member: true
    }
  })

  return toPost(created)
}

export const patchPost = async (ctx: AuthContext, code: string, id: string, input: PatchPostInput): Promise<Post> => {
  const group = await getGroupByCode(ctx, code)
  const post = await getPostById(code, id)

  const allowed = await canWritePost(ctx, group, post)
  if (!allowed) {
    throw forbidden('You do not have permission to update this post')
  }

  if (input.status !== undefined) {
    await validateStatusTransition(ctx, group, post, input.status)
  }

  if (input.categoryId !== undefined && input.categoryId !== null) {
    const db = tenantDb(prisma, code)
    const category = await db.category.findFirst({ where: { id: input.categoryId } })
    if (!category) {
      throw badRequest('Category not found')
    }
  }

  // Can't change post type
  if (input.type !== undefined && input.type !== post.type) {
    throw badRequest('Cannot change post type')
  }

  const { location, expires, categoryId, ...rest } = input
  
  // Extract type-specific data.
  const typeData = extractPostTypeData(rest, post)

  const updateData: PostUpdateInput = {
    ...rest,
    data: typeData
  }

  if (location !== undefined) {
    const coords = fromLocation(location)
    updateData.latitude = coords.latitude
    updateData.longitude = coords.longitude
  }

  if (expires !== undefined) {
    updateData.expires = expires ? new Date(expires) : null
  }
  
  if (categoryId !== undefined) {
    updateData.category = categoryId ? { connect: { id: categoryId } } : { disconnect: true }
  }

  const db = tenantDb(prisma, code)
  const updated = await db.post.update({
    where: { id: post.id },
    data: updateData,
    include: {
      member: true
    }
  })

  return toPost(updated)
}

export const deletePost = async (ctx: AuthContext, code: string, id: string): Promise<void> => {
  const group = await getGroupByCode(ctx, code)
  const post = await getPostById(code, id)

  const allowed = await canWritePost(ctx, group, post)
  if (!allowed) {
    throw forbidden('You do not have permission to delete this post')
  }

  const db = tenantDb(prisma, code)
  await db.post.update({
    where: { id: post.id },
    data: { deleted: new Date() },
  })
}
