import type { Express } from 'express'
import { generateKeys } from './auth'
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

const server = setupServer(...handlers)

type SetupTestServerResult = {
  app: Express
}

export const setupTestServer = async (): Promise<SetupTestServerResult> => {
  await generateKeys()
  server.listen({ onUnhandledRequest: 'bypass' })

  const module = await import('../../src/app')

  return {
    app: module.app,
  }
}

export const teardownTestServer = async () => {
  server.close()
}
