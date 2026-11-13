import logger from './utils/logger'
import { startServer } from './app'
import { startCleanupWorker } from './features/files/worker'
import { waitForPrisma } from './utils/prisma'

const main = async () => {
  logger.info('Starting social service...')
  await waitForPrisma()

  const { stop: stopServer } = startServer()
  const { stop: stopFileCleanup } = startCleanupWorker()

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`)
    await stopFileCleanup()
    await stopServer()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
