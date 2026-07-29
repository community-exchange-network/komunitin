import { S3Client } from '@aws-sdk/client-s3'
import { config } from '../config'

export const s3 = new S3Client({
  endpoint: config.UPLOAD_S3_ENDPOINT,
  region: config.UPLOAD_S3_REGION,
  forcePathStyle: config.UPLOAD_S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: config.UPLOAD_S3_ACCESS_KEY,
    secretAccessKey: config.UPLOAD_S3_SECRET_KEY,
  },
})
