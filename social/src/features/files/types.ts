import type { File as DbFile } from '../../generated/prisma/client'
import type { UploadFileFields, FileResourceType } from './schema'

export type UploadFileInput = UploadFileFields & {
  code: string
  data: Buffer
  filename?: string
  uploaderId: string
}
export type File = Omit<DbFile, 'resourceType'> & {
  resourceType: FileResourceType | null
}