import { json, z } from 'zod'
import { accessSchema, imageSchema, locationSchema } from '../groups/schema'
import { jsonApiDocumentSchema, jsonApiResourceSchema, jsonApiToOneNullableRelationshipSchema, jsonApiToOneRelationshipSchema } from '../../server/jsonapi-schema'

export const postTypeSchema = z.enum(['offers', 'needs'])
export type PostType = z.infer<typeof postTypeSchema>

export const postStatusSchema = z.enum(['draft', 'published', 'hidden'])
export type PostStatus = z.infer<typeof postStatusSchema>

export type Image = z.infer<typeof imageSchema>

const postEditableAttributesSchema = z.object({
  code: z.string().trim().min(1).max(255).optional(),
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().min(1).max(16384).optional(),
  images: z.array(imageSchema).optional(),
  status: postStatusSchema.optional(),
  access: accessSchema.optional(),
  location: locationSchema.optional(),
  expires: z.iso.datetime().optional(),
}).strict()


const createOfferAttributesSchema = postEditableAttributesSchema.extend({
  title: z.string().trim().min(1).max(255),
  description: z.string().min(1).max(16384),
  value: z.string().trim().min(1).max(255).optional(),
}).strict()

export type CreateOfferAttributes = z.infer<typeof createOfferAttributesSchema>

const patchOfferAttributesSchema = postEditableAttributesSchema.extend({
  value: z.string().trim().min(1).max(255).optional(),
}).strict()

export type PatchOfferAttributes = z.infer<typeof patchOfferAttributesSchema>


const createNeedAttributesSchema = postEditableAttributesSchema.extend({
  description: z.string().min(1).max(16384),
  fulfilled: z.iso.datetime().optional(),
}).strict()

export type CreateNeedAttributes = z.infer<typeof createNeedAttributesSchema>

const patchNeedAttributesSchema = postEditableAttributesSchema.extend({
  fulfilled: z.iso.datetime().optional(),
}).strict()

export type PatchNeedAttributes = z.infer<typeof patchNeedAttributesSchema>

const categoryRelationshipSchema = jsonApiToOneNullableRelationshipSchema('categories')
const memberRelationshipSchema = jsonApiToOneRelationshipSchema('members')

const createPostRelationshipsSchema = z.object({
  category: categoryRelationshipSchema.optional(),
  member: memberRelationshipSchema,
})

const updatePostRelationshipsSchema = z.object({
  category: categoryRelationshipSchema.optional(),
  member: memberRelationshipSchema.optional(),
}).strict().optional()

const createOfferResourceSchema = jsonApiResourceSchema('offers', createOfferAttributesSchema, createPostRelationshipsSchema)
const patchOfferResourceSchema = jsonApiResourceSchema('offers', patchOfferAttributesSchema, updatePostRelationshipsSchema)

const createNeedResourceSchema = jsonApiResourceSchema('needs', createNeedAttributesSchema, createPostRelationshipsSchema)
const patchNeedResourceSchema = jsonApiResourceSchema('needs', patchNeedAttributesSchema, updatePostRelationshipsSchema)

const createPostResourceSchema = z.discriminatedUnion('type', [createOfferResourceSchema, createNeedResourceSchema])
const patchPostResourceSchema = z.discriminatedUnion('type', [patchOfferResourceSchema, patchNeedResourceSchema])

export type CreatePostAttributes = z.infer<typeof createPostResourceSchema>['attributes']
export type PatchPostAttributes = z.infer<typeof patchPostResourceSchema>['attributes']

export const createPostBodySchema = jsonApiDocumentSchema(createPostResourceSchema)
export const patchPostBodySchema = jsonApiDocumentSchema(patchPostResourceSchema)

export type CreatePostBody = z.infer<typeof createPostBodySchema>
export type PatchPostBody = z.infer<typeof patchPostBodySchema>
