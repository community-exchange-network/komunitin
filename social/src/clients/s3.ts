import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { config } from '../config'
import { internalError } from '../utils/error'

const s3 = new S3Client({
  endpoint: config.UPLOAD_S3_ENDPOINT,
  region: config.UPLOAD_S3_REGION,
  forcePathStyle: config.UPLOAD_S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.UPLOAD_S3_ACCESS_KEY,
    secretAccessKey: config.UPLOAD_S3_SECRET_KEY,
  },
})

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '')
const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '')

// s3://bucket-name/optional/prefix -> bucket-name, optional/prefix
const uploadPrefixUrl = new URL(config.UPLOAD_S3_PREFIX)
const uploadBucket = uploadPrefixUrl.hostname
const uploadBaseKeyPrefix = trimSlashes(uploadPrefixUrl.pathname)
const fullObjectKey = (key: string) => uploadBaseKeyPrefix ? `${uploadBaseKeyPrefix}/${key}` : key

const defaultPublicUrl = () => {
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

/** The public base URL for uploaded files. */
export const publicUrlBase = trimTrailingSlash(config.UPLOAD_PUBLIC_URL ?? defaultPublicUrl())

export const uploadToS3 = async (key: string, contentType: string, data: Buffer): Promise<void> => {
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

/** Return metadata for an existing object, or null when it is absent. */
export const getS3ObjectMetadata = async (key: string): Promise<{ mime: string, size: number } | null> => {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: uploadBucket, Key: fullObjectKey(key) }))
    if (!head.ContentType || head.ContentLength === undefined) {
      throw new Error(`Missing S3 metadata for ${fullObjectKey(key)}`)
    }
    return { mime: head.ContentType, size: head.ContentLength }
  } catch (cause) {
    if ((cause as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      return null
    }
    throw internalError('Failed to get S3 object metadata', { cause })
  }
}
