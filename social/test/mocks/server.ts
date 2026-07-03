import type { Express } from 'express'
import { generateKeys } from './auth'
import { setupServer } from 'msw/node'
import { handlers, resetMockState } from './handlers'
import { installS3Mock, resetS3MockState } from './s3'

const server = setupServer(...handlers)

type SetupTestServerResult = {
  app: Express
  resetMocks: () => void
}

const resetMocks = () => {
  resetMockState()
  resetS3MockState()
}

export const setupTestServer = async (): Promise<SetupTestServerResult> => {
  await generateKeys()
  installS3Mock()
  server.listen({ onUnhandledRequest: 'bypass' })

  const module = await import('../../src/app')

  return {
    app: module.app,
    resetMocks,
  }
}

export const teardownTestServer = async () => {
  server.close()
}
