import { z } from 'zod'
import { jsonApiDocumentSchema, jsonApiResourceSchema } from '../../server/jsonapi-schema'

export const memberUserSettingsAttributesSchema = z.object({
  notifications: z.object({
    myAccount: z.boolean().optional(),
    group: z.boolean().optional(),
  }).strict().optional(),
  emails: z.object({
    myAccount: z.boolean().optional(),
    group: z.enum(['never', 'weekly', 'monthly']).optional(),
  }).strict().optional(),
}).strict()

const memberUserSchema = jsonApiResourceSchema(
  'member-users',
  memberUserSettingsAttributesSchema,
)

export const patchMemberUserBodySchema = jsonApiDocumentSchema(memberUserSchema)

export type PatchMemberUserBody = z.infer<typeof patchMemberUserBodySchema>
