import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { s3 } from '../../src/clients/s3'

// S3 needs to be mocked at the code level because the AWS SDK http client
// is not compatible with MSW.

let s3UploadError: Error | null = null
let s3DeleteError: Error | null = null
let s3DeleteRequests: string[] = []

const s3ObjectUrl = (bucket: string, key: string): string => {
  return `http://${bucket}.s3.test/${key}`
}

const defaultS3Error = (): Error => {
  const error = new Error('error')
  error.name = 'InternalError'
  return error
}

export const setS3UploadError = (error = defaultS3Error()) => {
  s3UploadError = error
}

export const setS3DeleteError = (error = defaultS3Error()) => {
  s3DeleteError = error
}

export const getS3DeleteRequests = (): string[] => {
  return [...s3DeleteRequests]
}

export const resetS3MockState = () => {
  s3UploadError = null
  s3DeleteError = null
  s3DeleteRequests = []
}

export const installS3Mock = () => {
  s3.send = async (command: any): Promise<any> => {
    if (command instanceof PutObjectCommand) {
      if (s3UploadError) {
        throw s3UploadError
      }

      const input = command.input
      if (input.ContentLength === 0) {
        throw defaultS3Error()
      }

      return {
        ETag: '"mock-etag"',
      }
    }

    if (command instanceof DeleteObjectCommand) {
      const input = command.input
      const bucket = String(input.Bucket)
      const key = String(input.Key)
      s3DeleteRequests.push(s3ObjectUrl(bucket, key))

      if (s3DeleteError) {
        throw s3DeleteError
      }

      return {}
    }

    throw new Error('Unexpected S3 command')
  }
}
