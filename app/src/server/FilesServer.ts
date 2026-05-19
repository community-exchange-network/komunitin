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

interface MockFilesState {
  maxUploadSize: number,
  uploadAttempts: MockFileUploadAttempt[]
}

const createMockFilesState = (): MockFilesState => ({
  maxUploadSize: Number.POSITIVE_INFINITY,
  uploadAttempts: []
})

let state = createMockFilesState()

const readUploadedFile = (requestBody: unknown) => {
  const file = typeof requestBody === 'object'
    && requestBody !== null
    && 'get' in requestBody
    && typeof requestBody.get === 'function'
    ? requestBody.get(fieldName)
    : null

  if (!(file instanceof File)) {
    throw new Error('Expected uploaded file in mock files endpoint')
  }

  return file
}

export const resetMockFileUploads = () => {
  state = createMockFilesState()
}

export const setMockFileUploadLimit = (size: number) => {
  state.maxUploadSize = size
}

export const getMockFileUploadAttempts = () => state.uploadAttempts

export default {
  routes(server: Server) {
    server.post(urlFiles, (_schema, request) => {
      const file = readUploadedFile(request.requestBody)
      const accepted = file.size <= state.maxUploadSize
      const url = `https://files.example/${file.name}`

      state.uploadAttempts.push({
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
