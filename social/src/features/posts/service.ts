import type { Post as DbPost, Category as DbCategory } from '../../generated/prisma/client'
import { PostUpdateInput } from '../../generated/prisma/models'
import type { AuthContext, OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { type CollectionResult, reorderByIds } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { slugify } from '../../utils/format'
import prisma, { toNullableJsonInput } from '../../utils/prisma'
import { syncResourceFiles } from '../files/service'
import { fromLocation, getGroupByCode, isGroupAdmin, isGroupMember, toLocation } from '../groups/service'
import type { Group } from '../groups/types'
import { type DbMember, enrichMembers, getMember, getMemberInclude, isMemberUser, toMember } from '../members/service'
import { createNotificationsClient } from '../../clients/notifications'
import type { PostStatus } from './schema'
import type { CreatePostInput, NeedData, OfferData, PatchPostInput, Post, SerializablePost } from './types'
import { findPostsIds } from './sql'
import { enrichCategories, toCategory } from '../categories/service'

const toPost = (dbPost: DbPost & { member: DbMember, category: DbCategory | null }): Post => {
  const { latitude, longitude, data, ...post} = dbPost
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
    member: toMember(dbPost.member),
    category: dbPost.category ? toCategory(dbPost.category) : null,
  } as Post
}

/** Add all metadata required to serialize posts and their included relationships. */
export const enrichPosts = async (
  ctx: OptionalAuthContext,
  group: Group,
  posts: Post[],
): Promise<SerializablePost[]> => {
  const [members, categories] = await Promise.all([
    enrichMembers(ctx, posts.map(({ member }) => member)),
    enrichCategories(
      ctx,
      group,
      posts.map(({ category }) => category).filter((category) => category !== null)
    ),
  ])
  const categoriesById = new Map(categories.map((category) => [category.id, category]))

  return posts.map((post, index): SerializablePost => ({
    ...post,
    member: members[index],
    category: post.category ? categoriesById.get(post.category.id)! : null,
  }))
}

export const enrichPost = async (
  ctx: OptionalAuthContext,
  group: Group,
  post: Post,
): Promise<SerializablePost> => {
  return (await enrichPosts(ctx, group, [post]))[0]
}

const getPostById = async (code: string, id: string): Promise<Post> => {
  const db = tenantDb(prisma, code)
  const post = await db.post.findFirst({
    where: {
      id,
      deleted: null,
      member: {
        deleted: null,
      },
    },
    include: {
      member: {
        include: getMemberInclude(),
      },
      category: true
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
    || ctx.canReadAllSocial
    || (group.status === 'active' && post.status === 'published' && post.access === 'public' )
    || (group.status === 'active' && post.status === 'published' && post.access === 'group' && await isGroupMember(ctx, group))
    || (await isPostOwner(ctx, post))
    || isGroupAdmin(ctx, group)
}

const canWritePost = async (ctx: AuthContext, group: Group, post: Post): Promise<boolean> => {
  return ctx.isSuperadmin
    || isGroupAdmin(ctx, group)
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

  const admin = ctx.isSuperadmin || isGroupAdmin(ctx, group)
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

const validatePostCategory = async (code: string, group: Group, categoryId: string): Promise<void> => {
  const db = tenantDb(prisma, code)
  const category = await db.category.findFirst({
    where: {
      id: categoryId,
      deleted: null,
      group: {
        id: group.id,
      },
    },
  })

  if (!category) {
    throw badRequest('Category not found')
  }
}

export const listPosts = async (ctx: OptionalAuthContext, code: string, params: CollectionParams): Promise<CollectionResult<SerializablePost>> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)

  const result = await findPostsIds(ctx, db, group, params)
  const posts = await db.post.findMany({
    where: {
      id: { in: result.ids },
    },
    include: {
      member: {
        include: getMemberInclude(),
      },
      category: true,
    },
  })

  const items = reorderByIds(posts, result.ids).map((post) => toPost(post))
  return {
    items: await enrichPosts(ctx, group, items),
    total: result.total,
  }
}

export const getPost = async (ctx: OptionalAuthContext, code: string, id: string): Promise<SerializablePost> => {
  const group = await getGroupByCode(ctx, code)
  const post = await getPostById(code, id)

  const allowed = await canReadPost(ctx, group, post)
  if (!allowed) {
    throw forbidden('You do not have permission to read this post')
  }

  return enrichPost(ctx, group, post)
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

export const createPost = async (ctx: AuthContext, code: string, input: CreatePostInput): Promise<SerializablePost> => {
  const db = tenantDb(prisma, code)

  const group = await getGroupByCode(ctx, code)

  // Resolve member
  const member = await getMember(ctx, code, input.memberId)

  // Check access
  const allowed = ctx.isSuperadmin 
    || await isMemberUser(ctx, member)  
    || isGroupAdmin(ctx, group)
  
  if (!allowed) {
    throw forbidden('You do not have permission to create a post for this member')
  }

  // Resolve category
  if (input.categoryId) {
    await validatePostCategory(code, group, input.categoryId)
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
      images: toNullableJsonInput(input.images),
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
      category: true,
      member: {
        include: getMemberInclude(),
      },
    }
  })

  await syncResourceFiles(code, input.type, created.id, (input.images ?? []).map((image) => image.url))

  if (created.status === 'published') {
    const notifications = createNotificationsClient(ctx)
    if (created.type === 'offers') {
      await notifications.notifyOfferPublished(code, created)
    } else {
      await notifications.notifyNeedPublished(code, created)
    }
  }

  return enrichPost(ctx, group, toPost(created))
}

export const patchPost = async (ctx: AuthContext, code: string, id: string, input: PatchPostInput): Promise<SerializablePost> => {
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
    await validatePostCategory(code, group, input.categoryId)
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
    images: toNullableJsonInput(input.images),
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
      member: {
        include: getMemberInclude(),
      },
      category: true
    }
  })

  if (input.images !== undefined) {
    await syncResourceFiles(code, post.type, post.id, (input.images ?? []).map((image) => image.url))
  }

  if (post.status !== 'published' && updated.status === 'published') {
    const notifications = createNotificationsClient(ctx)
    if (updated.type === 'offers') {
      await notifications.notifyOfferPublished(code, updated)
    } else {
      await notifications.notifyNeedPublished(code, updated)
    }
  }

  return enrichPost(ctx, group, toPost(updated))
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

  await syncResourceFiles(code, post.type, post.id, [])
}
