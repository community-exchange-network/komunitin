import { z } from 'zod'
import { jsonApiDocumentSchema, jsonApiResourceSchema } from '../../server/jsonapi-schema'

const userAttributesSchema = z.object({
  email: z.email().optional(),
  name: z.string().trim().min(1).max(255).optional(),
  language: z.string().trim().min(1).max(31).nullable().optional(),
}).strict()

export type UserAttributes = z.infer<typeof userAttributesSchema>

const userSchema = jsonApiResourceSchema('users', userAttributesSchema)

export const createUserBodySchema = jsonApiDocumentSchema(userSchema)
export const patchUserBodySchema = jsonApiDocumentSchema(
  jsonApiResourceSchema('users', z.object({
    language: z.string().trim().min(1).max(31).nullable(),
  }).strict()),
)
export const unsubscribeQuerySchema = z.object({
  token: z.string().min(1),
})

export type CreateUserBody = z.infer<typeof createUserBodySchema>
export type PatchUserBody = z.infer<typeof patchUserBodySchema>
