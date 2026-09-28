import type { Request } from 'express'
import { fileTypeFromBuffer } from 'file-type'
import { randomUUID } from 'node:crypto'
import { config } from '../../config'
import { publicUrlBase, uploadToS3 } from '../../clients/s3'
import type { File as DbFile } from '../../generated/prisma/client'
import type { AuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { badRequest, forbidden } from '../../utils/error'
import prisma from '../../utils/prisma'
import { getGroupByCode, isGroupAdmin, isGroupMember } from '../groups/service'
import { parseUploadMultipart } from './multipart'
import type { FileResourceType } from './schema'
import type { File } from './types'

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const assertMimeAllowed = (mime: string): void => {
  if (!config.UPLOAD_ALLOWED_MIME_TYPES.includes(mime)) {
    throw badRequest('Unsupported file type')
  }
}

const extensionFromMime = (mime: string): string => {
  const ext = MIME_TO_EXT[mime]
  if (!ext) {
    throw badRequest('Unsupported file type')
  }

  return ext
}

/**
 * The file S3 key excluding the common prefix.
 */
const buildObjectKey = (code: string, folder: string, filename: string): string => {
  return `${code}/${folder}/${filename}`
}

const toFile = (dbFile: DbFile): File => {
  return dbFile as File
}

const normalizeUrls = (urls: string[]): string[] => {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)))
}

/**
 * Synchronize the file records associated with a specific resource.
 * 
 * This function needs to be called after any update to a resource that has files associated with it, 
 * to ensure that the file records in the database are correctly linked or unlinked to the resource 
 * based on the provided URLs.
 */
export const syncResourceFiles = async (
  tenantId: string,
  resourceType: FileResourceType,
  resourceId: string,
  urls: string[],
): Promise<void> => {
  const normalizedUrls = normalizeUrls(urls)
  const db = tenantDb(prisma, tenantId)

  await db.transaction(async (tx) => {
    // Find first the ids of files identified by the URLs
    const existingFiles = await tx.file.findMany({
      where: {
        tenantId,
        url: { in: normalizedUrls },
        resourceType,
        OR: [
          { resourceId: null },
          { resourceId },
        ]
      },
      select: {
        id: true
      },
    })
    const ids = existingFiles.map((file) => file.id)
    
    // Unlink files that are currently linked to the resource but not included in the new URLs
    await tx.file.updateMany({
      where: {
        tenantId,
        resourceType,
        resourceId,
        id: {notIn: ids}
      },
      data: {
        resourceId: null,
      },
    })

    if (ids.length === 0) {
      return
    }
    
    // Link the identified files to the resource (not already linked)
    await tx.file.updateMany({
      where: {
        tenantId,
        id: { in: ids },
        resourceId: null,
      },
      data: {
        resourceType,
        resourceId,
      },
    })
  })
}

/**
 * Handle a file upload, validate it, store it in S3, and persist the file record.
 */
export const createUploadedFile = async (
  ctx: AuthContext,
  code: string,
  req: Request,
): Promise<File> => {
  const group = await getGroupByCode(ctx, code)

  // Verify access.
  const allowed = ctx.isSuperadmin
    || isGroupAdmin(ctx, group)
    || await isGroupMember(ctx, group, ['draft', 'pending', 'active'])

  if (!allowed) {
    throw forbidden('You do not have permission to upload files in this group')
  }

  // Get file and fields from the multipart request.
  const { fields, file } = await parseUploadMultipart(req, config.UPLOAD_MAX_BYTES)
  const data = file.buffer

  // Validate file size and type.
  if (data.length > config.UPLOAD_MAX_BYTES) {
    throw badRequest('File is too large')
  }

  const detected = await fileTypeFromBuffer(data)
  if (!detected) {
    throw badRequest('Unsupported file type')
  }

  assertMimeAllowed(detected.mime)
  const extension = extensionFromMime(detected.mime)

  // Generate a unique random filename.
  const generatedFilename = `${randomUUID()}.${extension}`
  const key = buildObjectKey(code, fields.resourceType, generatedFilename)

  // Upload to S3.
  await uploadToS3(key, detected.mime, data)

  // Create the file record in the database.
  const filename = file.originalFilename ? file.originalFilename.slice(0, 255) : generatedFilename

  const fileData = {
    key,
    url: `${publicUrlBase}/${key}`,
    mime: detected.mime,
    filename,
    size: data.length,
    uploaderId: ctx.userId,
    resourceType: fields.resourceType,
    resourceId: null,
  }
  const db = tenantDb(prisma, code)
  const dbFile = await db.file.create({ data: fileData })

  return toFile(dbFile)
}
