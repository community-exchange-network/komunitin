import { z } from 'zod'
import { jsonApiDocumentSchema, jsonApiResourceSchema } from '../../server/jsonapi-schema'

export const userSettingsAttributesSchema = z.object({
  language: z.string().optional(),
  notifications: z.object({
    myAccount: z.boolean().optional(),
    group: z.boolean().optional(),
  }).optional(),
  emails: z.object({
    myAccount: z.boolean().optional(),
    group: z.enum(['never', 'weekly', 'monthly']).optional(),
  }).optional(),
}).strict()

export type UserSettings = z.infer<typeof userSettingsAttributesSchema>

const userSettingsSchema = jsonApiResourceSchema('user-settings', userSettingsAttributesSchema)

const userAttributesSchema = z.object({
  email: z.email().optional(),
  name: z.string().trim().min(1).max(255).optional(),
}).strict()

export type UserAttributes = z.infer<typeof userAttributesSchema>

const userSchema = jsonApiResourceSchema('users', userAttributesSchema)

export const createUserBodySchema = jsonApiDocumentSchema(userSchema, userSettingsSchema)
export const patchUserSettingsBodySchema = jsonApiDocumentSchema(userSettingsSchema)

export type CreateUserBody = z.infer<typeof createUserBodySchema>
export type PatchUserSettingsBody = z.infer<typeof patchUserSettingsBodySchema>
