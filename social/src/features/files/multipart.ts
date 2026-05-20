import type { Request } from 'express'
import formidable, { type File as FormidableFile, type Fields, type Files } from 'formidable'
import { badRequest } from '../../utils/error'
import { uploadFileFieldsSchema, type UploadFileFields } from './schema'

const firstString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

const getSingleFile = (files: Files): FormidableFile => {
  const all = Object.values(files)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter(v => v !== undefined)
  
  if (all.length === 0) {
    throw badRequest('A file is required')
  }
  if (all.length > 1) {
    throw badRequest('Only one file is allowed')
  }

  return all[0]
}

const parseFields = (fields: Fields): UploadFileFields => {
  const parsed = uploadFileFieldsSchema.safeParse({
    resourceType: firstString(fields.resourceType),
  })

  if (!parsed.success) {
    throw badRequest('Invalid upload fields', { details: parsed.error.issues })
  }

  return parsed.data
}

export const parseUploadMultipart = async (
  req: Request,
  maxFileSize: number,
): Promise<{ fields: UploadFileFields; file: FormidableFile }> => {
  const form = formidable({
    multiples: false,
    maxFiles: 1,
    maxFileSize,
    allowEmptyFiles: false,
  })

  let fields: Fields
  let files: Files

  try {
    [fields, files] = await form.parse(req)
  } catch (cause) {
    throw badRequest('Invalid multipart upload', { cause })
  }

  const file = getSingleFile(files)

  if (file.size > maxFileSize) {
    throw badRequest('File is too large')
  }

  const parsedFields = parseFields(fields)
  return { fields: parsedFields, file }
}
