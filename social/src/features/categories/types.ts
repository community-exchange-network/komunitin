import type { Category as DbCategory } from '../../generated/prisma/client'
import type { PostRelationshipMeta } from '../posts/types'
import type { Icon, CategoryMeta, CreateCategoryAttributes, PatchCategoryAttributes } from './schema'


// Input types derived from request schema
export type CreateCategoryInput = CreateCategoryAttributes
export type PatchCategoryInput = PatchCategoryAttributes


// Output types derived from Prisma models
export interface Category extends DbCategory {
  icon: Icon
  meta: CategoryMeta
}

export interface SerializableCategory extends Category {
  relationshipMeta: PostRelationshipMeta
}
