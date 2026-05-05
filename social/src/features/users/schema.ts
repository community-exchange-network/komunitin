import { z } from 'zod'

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

const userSettingsSchema = z.object({
  type: z.literal('user-settings'),
  id: z.string().optional(),
  attributes: userSettingsAttributesSchema,
}).strict()

const userAttributesSchema = z.object({
  email: z.email().optional(),
  name: z.string().trim().min(1).max(255).optional(),
}).strict()

export type UserAttributes = z.infer<typeof userAttributesSchema>

const userSchema = z.object({
  type: z.literal('users'),
  id: z.string().optional(),
  attributes: userAttributesSchema.optional(),
}).strict()

export const createUserBodySchema = z.object({
  data: userSchema,
  included: z.array(userSettingsSchema).optional(),
}).strict()

export type CreateUserBody = z.infer<typeof createUserBodySchema>
