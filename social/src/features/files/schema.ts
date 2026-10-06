import { z } from 'zod'

export const fileResourceTypeSchema = z.enum(['members', 'groups', 'offers', 'needs'])

export type FileResourceType = z.infer<typeof fileResourceTypeSchema>

export const uploadFileFieldsSchema = z.object({
  resourceType: fileResourceTypeSchema,
}).strict()

export type UploadFileFields = z.infer<typeof uploadFileFieldsSchema>
