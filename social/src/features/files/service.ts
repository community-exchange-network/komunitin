import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import type { Request } from 'express'
import { fileTypeFromBuffer } from 'file-type'
import { randomUUID } from 'node:crypto'
import { config } from '../../config'
import { s3 } from '../../clients/s3'
import type { File as DbFile } from '../../generated/prisma/client'
import type { AuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { badRequest, forbidden, internalError } from '../../utils/error'
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

// Remove slashes "/" from the end of a string.
const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '')
// Remove slashes "/" from the start and end of a string.
const trimSlashes = (value: string): string => value.replace(/^\/+|\/+$/g, '')

// s3://bucket-name/optional/prefix -> bucket-name, optional/prefix
const uploadPrefixUrl = new URL(config.UPLOAD_S3_PREFIX)
const uploadBucket = uploadPrefixUrl.hostname
const uploadBaseKeyPrefix = trimSlashes(uploadPrefixUrl.pathname)

/**
 * The public base URL for accessing files, derived from the S3 endpoint URL.
 */
const defaultPublicUrl = (): string => {
  const endpoint = trimTrailingSlash(config.UPLOAD_S3_ENDPOINT)
  if (config.UPLOAD_S3_FORCE_PATH_STYLE) {
    const pathBase = `${endpoint}/${uploadBucket}`
    return uploadBaseKeyPrefix ? `${pathBase}/${uploadBaseKeyPrefix}` : pathBase
  }

  const parsed = new URL(endpoint)
  const endpointPath = trimSlashes(parsed.pathname)
  const fullPath = [endpointPath, uploadBaseKeyPrefix].filter(Boolean).join('/')
  const hostBase = `${parsed.protocol}//${uploadBucket}.${parsed.host}`
  return fullPath ? `${hostBase}/${fullPath}` : hostBase
}

/**
 * The public base URL for accessing files.
 */
const publicUrlBase = trimTrailingSlash(config.UPLOAD_PUBLIC_URL ?? defaultPublicUrl())

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

const fullObjectKey = (key: string): string => {
  return uploadBaseKeyPrefix ? `${uploadBaseKeyPrefix}/${key}` : key
}

const uploadToS3 = async (key: string, contentType: string, data: Buffer): Promise<void> => {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: uploadBucket,
      Key: fullObjectKey(key),
      Body: data,
      ContentType: contentType,
      ContentLength: data.length,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
  } catch (cause) {
    throw internalError('Failed to upload file', { cause })
  }
}

export const deleteFromS3 = async (key: string): Promise<void> => {
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: uploadBucket,
      Key: fullObjectKey(key),
    }))
  } catch (cause) {
    throw internalError('Failed to delete file', { cause })
  }
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
    || await isGroupAdmin(ctx, group)
    || await isGroupMember(ctx, group)

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
