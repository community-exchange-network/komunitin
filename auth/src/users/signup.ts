import { z } from 'zod'

const signupSchema = z.object({
  name: z.string().min(1),
  language: z.string().min(1),
})

export const signupContextSchema = z.discriminatedUnion('type', [
  signupSchema.extend({
    type: z.literal('group'),
  }),
  signupSchema.extend({
    type: z.literal('member'),
    groupCode: z.string().min(1),
  }),
])

export type SignupContext = z.infer<typeof signupContextSchema>
