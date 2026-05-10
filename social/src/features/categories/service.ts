import z from 'zod'
import type { Category as DbCategory } from '../../generated/prisma/client'
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

const canAccessCategory = async (ctx: OptionalAuthContext, group: Group, category: Category): Promise<boolean> => {
  return ctx.isSuperadmin
    || (group.status === 'active' && category.access === 'public')
    || (group.status === 'active' && category.access === 'group' && await isGroupMember(ctx, group))
    || await isGroupAdmin(ctx, group)
}

const toCategory = (dbCategory: DbCategory): Category => {
  return dbCategory as Category
}

const getCategory = async (code: string, id: string): Promise<Category> => {
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

  const db = tenantDb(prisma, code)

  const categories = await db.category.findMany({
    where: filterWhere,
    orderBy: orderBySort(params.sort),
  })

  const visibleCategories: Category[] = []
  for (const dbCategory of categories) {
    const category = toCategory(dbCategory)
    if (await canAccessCategory(ctx, group, category)) {
      visibleCategories.push(category)
    }
  }

  return visibleCategories.slice(params.pagination.cursor, params.pagination.cursor + params.pagination.size)
}

export const createCategory = async (ctx: AuthContext, code: string, input: CreateCategoryInput): Promise<Category> => {
  const group = await getGroupByCode(ctx, code)
  const allowed = await canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to create categories in this group')
  }

  const db = tenantDb(prisma, code)
  const existing = await db.category.findFirst({
    where: { code: input.code },
  })

  if (existing) {
    throw badRequest('A category with this code already exists')
  }

  if (!input.code) {
    input.code = slugify(input.name)
  }

  const created = await db.category.create({
    data: {
      code: input.code,
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

  const category = await getCategory(code, id)

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
  const category = await getCategory(code, id)

  await db.category.delete({
    where: {
      id: category.id,
    },
  })
}
