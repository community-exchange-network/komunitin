import { type Category as DbCategory } from '../../generated/prisma/client'
import { type AuthContext, type OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { type CollectionResult, reorderByIds } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { slugify } from '../../utils/format'
import prisma from '../../utils/prisma'
import { canWriteGroup, getGroupByCode } from '../groups/service'
import type { Group } from '../groups/types'
import type { Category, CreateCategoryInput, PatchCategoryInput, SerializableCategory } from './types'
import { findCategoriesIds } from './sql'
import { findPostRelationshipCounts } from '../posts/sql'

export const toCategory = (dbCategory: DbCategory): Category => {
  return dbCategory as Category
}

/** Add viewer-specific post counts required by the category serializer. */
export const enrichCategories = async (
  ctx: OptionalAuthContext,
  group: Group,
  categories: Category[],
): Promise<SerializableCategory[]> => {
  const db = tenantDb(prisma, group.code)
  const counts = await findPostRelationshipCounts(ctx, db, group, {
    categoryIds: categories.map(({ id }) => id),
  })

  return categories.map((category) => ({
    ...category,
    relationshipMeta: counts.categories.get(category.id)!,
  }))
}

export const enrichCategory = async (
  ctx: OptionalAuthContext,
  group: Group,
  category: Category,
) => {
  return (await enrichCategories(ctx, group, [category]))[0]
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

export const listCategories = async (ctx: OptionalAuthContext, code: string, params: CollectionParams): Promise<CollectionResult<SerializableCategory>> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)
  const result = await findCategoriesIds(ctx, db, group, params)

  const categories = await db.category.findMany({
    where: {
      id: { in: result.ids },
    },
  })

  const items = reorderByIds(categories, result.ids).map(toCategory)
  return {
    items: await enrichCategories(ctx, group, items),
    total: result.total,
  }
}

export const createCategory = async (ctx: AuthContext, code: string, input: CreateCategoryInput): Promise<SerializableCategory> => {
  const group = await getGroupByCode(ctx, code)
  const allowed = canWriteGroup(ctx, group)
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

  return enrichCategory(ctx, group, toCategory(created))
}

export const patchCategory = async (
  ctx: AuthContext,
  code: string,
  id: string,
  input: PatchCategoryInput,
): Promise<SerializableCategory> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = canWriteGroup(ctx, group)
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

  return enrichCategory(ctx, group, toCategory(updated))
}

export const deleteCategory = async (
  ctx: AuthContext,
  code: string,
  id: string,
): Promise<void> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = canWriteGroup(ctx, group)
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
