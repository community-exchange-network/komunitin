import { z } from 'zod'
import {
  jsonApiDocumentSchema,
  jsonApiResourceSchema,
  jsonApiToOneRelationshipSchema,
} from '../../server/jsonapi-schema'

export const accessSchema = z.enum(['public', 'group', 'private'])
export type Access = z.infer<typeof accessSchema>

export const imageSchema = z.object({
  url: z.url(),
  alt: z.string().optional(),
}).strict()

export const addressSchema = z.object({
  streetAddress: z.string().optional(),
  addressLocality: z.string().optional(),
  postalCode: z.string().optional(),
  addressRegion: z.string().optional(),
  addressCountry: z.string().optional(),
}).strict()
export type Address = z.infer<typeof addressSchema>

export const contactTypeSchema = z.enum(['phone', 'email', 'telegram', 'whatsapp', 'website'])

export const contactSchema = z.object({
  type: contactTypeSchema,
  value: z.string(),
}).strict()

export type Contact = z.infer<typeof contactSchema>

export const locationSchema = z.object({
  name: z.string().optional(),
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
}).strict()

export type Location = z.infer<typeof locationSchema>

const groupEditableAttributesSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().optional(),
  access: accessSchema.optional(),
  image: imageSchema.nullable().optional(),
  address: addressSchema.optional(),
  contacts: z.array(contactSchema).optional(),
  location: locationSchema.optional(),
}).strict()

const createGroupAttributesSchema = groupEditableAttributesSchema.extend({
  code: z.string().trim().min(1).max(31),
  name: z.string().trim().min(1).max(255),
})
export type CreateGroupAttributes = z.infer<typeof createGroupAttributesSchema>

export const groupSettingsAttributesSchema = z.object({
  requireAcceptTerms: z.boolean().optional(),
  terms: z.string().optional(),
  minOffers: z.number().optional(),
  minNeeds: z.number().optional(),
  allowAnonymousMemberList: z.boolean().optional(),
  enableGroupEmail: z.boolean().optional(),
  defaultGroupEmailFrequency: z.enum(['never', 'weekly', 'monthly']).optional(),
}).strict()
export type GroupSettings = z.infer<typeof groupSettingsAttributesSchema>

// Currency schema is defined and validated by accounting service. 
// So we dont define it here. We just validate its overall size is reasonable.
export const currencyAttributesSchema = z.object().loose().refine((data) => {
  return JSON.stringify(data).length < 10000
})

const groupSettingsSchema = jsonApiResourceSchema('group-settings', groupSettingsAttributesSchema)
const currencySchema = jsonApiResourceSchema('currencies', currencyAttributesSchema)
const createGroupRelationshipsSchema = z.object({
  currency: jsonApiToOneRelationshipSchema('currencies').optional(),
}).strict().optional()

const groupStatuses = ['pending', 'active', 'disabled'] as const
export type GroupStatus = typeof groupStatuses[number]

const patchGroupAttributesSchema = groupEditableAttributesSchema.extend({
  status: z.enum(groupStatuses).optional(),
})

export type PatchGroupAttributes = z.infer<typeof patchGroupAttributesSchema>
export type PatchGroupSettingsAttributes = z.infer<typeof groupSettingsAttributesSchema>

export const createGroupBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('groups', createGroupAttributesSchema, createGroupRelationshipsSchema),
  [groupSettingsSchema, currencySchema],
)

export const patchGroupBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('groups', patchGroupAttributesSchema),
)

export const patchGroupSettingsBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('group-settings', groupSettingsAttributesSchema),
)

export type CreateGroupBody = z.infer<typeof createGroupBodySchema>
export type PatchGroupBody = z.infer<typeof patchGroupBodySchema>
export type PatchGroupSettingsBody = z.infer<typeof patchGroupSettingsBodySchema>
