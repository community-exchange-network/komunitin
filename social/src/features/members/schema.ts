import { z } from 'zod'
import { jsonApiDocumentSchema, jsonApiResourceSchema } from '../../server/jsonapi-schema'
import {
  accessSchema,
  addressSchema,
  contactSchema,
  imageSchema,
  locationSchema,
  type Address,
  type Contact,
  type Location,
} from '../groups/schema'

export type { Address, Contact, Location }

export const memberTypeSchema = z.enum(['personal', 'business', 'organization'])
export type MemberType = z.infer<typeof memberTypeSchema>

export const memberStatusSchema = z.enum(['draft', 'pending', 'active', 'inactive', 'suspended'])
export type MemberStatus = z.infer<typeof memberStatusSchema>

const memberMetaSchema = z.record(z.string(), z.any())
export type MemberMeta = z.infer<typeof memberMetaSchema>

const memberEditableAttributesSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  type: memberTypeSchema.optional(),
  description: z.string().optional(),
  access: accessSchema.optional(),
  image: imageSchema.optional(),
  address: addressSchema.optional(),
  contacts: z.array(contactSchema).optional(),
  location: locationSchema.optional(),
  meta: memberMetaSchema.optional(),
}).strict()

const createMemberAttributesSchema = memberEditableAttributesSchema.extend({
  code: z.string().trim().min(1).max(255).optional(),
  name: z.string().trim().min(1).max(255),
})

const patchMemberAttributesSchema = memberEditableAttributesSchema.extend({
  status: memberStatusSchema.optional(),
})

export type CreateMemberAttributes = z.infer<typeof createMemberAttributesSchema>
export type PatchMemberAttributes = z.infer<typeof patchMemberAttributesSchema>

export const createMemberBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('members', createMemberAttributesSchema),
)

export const patchMemberBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('members', patchMemberAttributesSchema),
)

export type CreateMemberBody = z.infer<typeof createMemberBodySchema>
export type PatchMemberBody = z.infer<typeof patchMemberBodySchema>
