import type { Server } from "miragejs"
import { Response } from "miragejs"
import { config } from "src/utils/config"
import { jsonApiError } from "./ServerUtils"

const fieldName = "file"

export interface MockFileUploadAttempt {
  accepted: boolean
  name: string
  size: number
  type: string
  url: string
}

interface MockFilesState {
  maxUploadSize: number
  uploadAttempts: MockFileUploadAttempt[]
}

const createMockFilesState = (): MockFilesState => ({
  maxUploadSize: Number.POSITIVE_INFINITY,
  uploadAttempts: []
})

let state = createMockFilesState()

const isFormData = (requestBody: unknown): requestBody is FormData => {
  return requestBody instanceof FormData
}

const readUploadedFile = (requestBody: unknown) => {
  const file = isFormData(requestBody) ? requestBody.get(fieldName) : null
  if (!(file instanceof File)) {
    throw new Error("Expected uploaded file in mock files endpoint")
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
    server.post(`${config.SOCIAL_URL}/:code/files/upload`, (_schema, request) => {
      const file = readUploadedFile(request.requestBody)
      const resourceType = isFormData(request.requestBody)
        ? request.requestBody.get("resourceType")?.toString()
        : undefined
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
        return jsonApiError(413, "File too large")
      }

      return new Response(201, {}, {
        data: {
          type: "files",
          id: file.name,
          attributes: {
            url,
            mime: file.type,
            key: file.name,
            size: file.size,
            filename: file.name,
            resourceType,
            created: new Date().toJSON(),
            updated: new Date().toJSON()
          }
        }
      })
    })
  }
}
