import { type Category as DbCategory } from '../../generated/prisma/client'
import { type AuthContext, type OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { reorderByIds } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { slugify } from '../../utils/format'
import prisma from '../../utils/prisma'
import { canWriteGroup, getGroupByCode } from '../groups/service'
import type { Category, CreateCategoryInput, PatchCategoryInput } from './types'
import { findCategoriesIds } from './sql'

export const toCategory = (dbCategory: DbCategory): Category => {
  return dbCategory as Category
}

const getCategoryById = async (code: string, id: string): Promise<Category> => {
  const db = tenantDb(prisma, code)

  const category = await db.category.findUnique({
    where: {
      id,
      deleted: null,
    },
  })

  if (!category) {
    throw notFound('Category not found')
  }

  return toCategory(category)
}

export const listCategories = async (ctx: OptionalAuthContext, code: string, params: CollectionParams): Promise<Category[]> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)
  const ids = await findCategoriesIds(ctx, db, group, params)

  if (ids.length === 0) {
    return []
  }

  const categories = await db.category.findMany({
    where: {
      id: { in: ids },
    },
  })

  return reorderByIds(categories, ids).map(toCategory)
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

  await db.transaction(async (tx) => {
    const livePosts = await tx.post.count({
      where: {
        categoryId: category.id,
        deleted: null,
      },
    })

    if (livePosts > 0) {
      throw badRequest('Category has live posts')
    }

    await tx.category.update({
      where: {
        id: category.id,
      },
      data: {
        deleted: new Date(),
      },
    })
  })
}
