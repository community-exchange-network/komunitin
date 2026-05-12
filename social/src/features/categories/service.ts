import { z } from 'zod'
import { Prisma, type Category as DbCategory } from '../../generated/prisma/client'
import { type AuthContext, type OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { orderBySort, whereFilter } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { slugify } from '../../utils/format'
import prisma from '../../utils/prisma'
import { canWriteGroup, getGroupByCode, isGroupAdmin, isGroupMember } from '../groups/service'
import type { Group } from '../groups/types'
import type { Category, CreateCategoryInput, PatchCategoryInput } from './types'

const toCategory = (dbCategory: DbCategory): Category => {
  return dbCategory as Category
}

const buildReadableCategoryWhere = async (
  ctx: OptionalAuthContext,
  group: Group,
): Promise<Prisma.CategoryWhereInput | null> => {
  if (ctx.isSuperadmin || await isGroupAdmin(ctx, group)) {
    return {}
  }

  const groupMember = await isGroupMember(ctx, group)
  if (groupMember) {
    return { access: { in: ['public', 'group'] } }
  } else if (group.status === 'active') {
    return { access: 'public' }
  } else {
    return null
  }
}

const getCategoryById = async (code: string, id: string): Promise<Category> => {
  const validation = z.uuid().safeParse(id)
  if (!validation.success) {
    throw notFound('Category not found')
  }
  
  const db = tenantDb(prisma, code)

  const category = await db.category.findFirst({
    where: { id },
  })

  if (!category) {
    throw notFound('Category not found')
  }

  return toCategory(category)
}

export const listCategories = async (ctx: OptionalAuthContext, code: string, params: CollectionParams): Promise<Category[]> => {
  const group = await getGroupByCode(ctx, code)
  const filterWhere = whereFilter(params.filters)
  const visibilityWhere = await buildReadableCategoryWhere(ctx, group)

  if (visibilityWhere === null) {
    return []
  }

  const db = tenantDb(prisma, code)

  const categories = await db.category.findMany({
    where: {
      AND: [filterWhere, visibilityWhere],
    },
    orderBy: orderBySort(params.sort),
    skip: params.pagination.cursor,
    take: params.pagination.size,
  })

  return categories.map(toCategory)
}

export const createCategory = async (ctx: AuthContext, code: string, input: CreateCategoryInput): Promise<Category> => {
  const group = await getGroupByCode(ctx, code)
  const allowed = await canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to create categories in this group')
  }

  const db = tenantDb(prisma, code)
  
  const categoryCode = input.code?.trim() || slugify(input.name)

  const existing = await db.category.findFirst({
    where: { code: categoryCode },
  })

  if (existing) {
    throw badRequest('A category with this code already exists')
  }

  const created = await db.category.create({
    data: {
      code: categoryCode,
      name: input.name,
      access: input.access ?? group.access,
      icon: input.icon as any,
      meta: input.meta as any,
      groupId: group.id,
    },
  })

  return toCategory(created)
}

export const patchCategory = async (
  ctx: AuthContext,
  code: string,
  id: string,
  input: PatchCategoryInput,
): Promise<Category> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = await canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to update categories in this group')
  }

  const category = await getCategoryById(code, id)

  const db = tenantDb(prisma, code)

  const updated = await db.category.update({
    where: {
      id: category.id,
    },
    data: {
      ...input,
      icon: input.icon as any,
      meta: input.meta as any,
    },
  })

  return toCategory(updated)
}

export const deleteCategory = async (
  ctx: AuthContext,
  code: string,
  id: string,
): Promise<void> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = await canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to delete categories in this group')
  }

  const db = tenantDb(prisma, code)
  const category = await getCategoryById(code, id)

  await db.category.delete({
    where: {
      id: category.id,
    },
  })
}
