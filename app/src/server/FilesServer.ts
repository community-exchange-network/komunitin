import type { Server } from 'miragejs'
import { Response } from 'miragejs'
import { config } from 'src/utils/config'

const urlFiles = config.FILES_URL
const fieldName = 'files[file]'

interface MockFileUploadAttempt {
  accepted: boolean,
  name: string,
  size: number,
  type: string,
  url: string
}

let maxUploadSize = Number.POSITIVE_INFINITY
let uploadAttempts: MockFileUploadAttempt[] = []

const readUploadedFile = (requestBody: unknown) => {
  const file = typeof requestBody === 'object' && requestBody !== null && 'get' in requestBody
    ? requestBody.get(fieldName)
    : null

  if (!(file instanceof File)) {
    throw new Error('Expected uploaded file in mock files endpoint')
  }

  return file
}

export const resetMockFileUploads = () => {
  maxUploadSize = Number.POSITIVE_INFINITY
  uploadAttempts = []
}

export const setMockFileUploadLimit = (size: number) => {
  maxUploadSize = size
}

export const getMockFileUploadAttempts = () => uploadAttempts

export default {
  routes(server: Server) {
    server.post(urlFiles, (_schema, request) => {
      const file = readUploadedFile(request.requestBody)
      const accepted = file.size <= maxUploadSize
      const url = `https://files.example/${file.name}`

      uploadAttempts.push({
        accepted,
        name: file.name,
        size: file.size,
        type: file.type,
        url
      })

      if (!accepted) {
        return new Response(413, {}, {
          errors: [{ detail: 'File too large' }]
        })
      }

      return new Response(201, {}, {
        data: {
          attributes: {
            url
          }
        }
      })
    })
  }
}
