import type { Request } from 'express'
import formidable, { type File as FormidableFile, type Fields, type Files } from 'formidable'
import { Writable } from 'node:stream'
import { badRequest } from '../../utils/error'
import { uploadFileFieldsSchema, type UploadFileFields } from './schema'

export type UploadedMultipartFile = {
  buffer: Buffer
  originalFilename?: string
  size: number
}

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
): Promise<{ fields: UploadFileFields; file: UploadedMultipartFile }> => {
  // We save all chunks in an array and create the final buffer at the end, since we don't know
  // the final buffer size in advance. Concatenating on every chunk would be inefficient.
  const chunks: Buffer[] = []
  const form = formidable({
    multiples: false,
    maxFiles: 1,
    maxFileSize,
    allowEmptyFiles: false,
    fileWriteStreamHandler: (): Writable => new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk)
        callback()
      },
    }),
  })

  let fields: Fields
  let files: Files

  try {
    [fields, files] = await form.parse(req)
  } catch (cause) {
    throw badRequest('Invalid multipart upload', { cause })
  }

  const file = getSingleFile(files)
  const buffer = Buffer.concat(chunks)

  if (file.size > maxFileSize) {
    throw badRequest('File is too large')
  }

  if (buffer.length === 0) {
    throw badRequest('A file is required')
  }

  const parsedFields = parseFields(fields)
  return {
    fields: parsedFields,
    file: {
      buffer,
      originalFilename: file.originalFilename ?? undefined,
      size: file.size,
    },
  }
}
