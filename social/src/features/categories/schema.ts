import { z } from 'zod'
import { jsonApiDocumentSchema, jsonApiResourceSchema } from '../../server/jsonapi-schema'
import { accessSchema } from '../groups/schema'

const iconSchema = z.object({
  type: z.string(),
  value: z.string(),
}).strict()

export type Icon = z.infer<typeof iconSchema>

const categoryMetaSchema = z.object({
  description: z.string().trim().max(1000).optional(),
}).strict()

export type CategoryMeta = z.infer<typeof categoryMetaSchema>

const categoryEditableAttributesSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  access: accessSchema.optional(),
  icon: iconSchema.optional(),
  meta: categoryMetaSchema.optional(),
}).strict()

const createCategoryAttributesSchema = categoryEditableAttributesSchema.extend({
  code: z.string().trim().min(1).max(255).optional(),
  name: z.string().trim().min(1).max(255),
})

export type CreateCategoryAttributes = z.infer<typeof createCategoryAttributesSchema>
export type PatchCategoryAttributes = z.infer<typeof categoryEditableAttributesSchema>

export const createCategoryBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('categories', createCategoryAttributesSchema),
)

export const patchCategoryBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('categories', categoryEditableAttributesSchema),
)

export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>
export type PatchCategoryBody = z.infer<typeof patchCategoryBodySchema>
