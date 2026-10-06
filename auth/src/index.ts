import logger from './utils/logger'
import { startServer } from './app'

const main = async () => {
  logger.info('Starting auth service...')
  const { stop } = await startServer()

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`)
    await stop()
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  logger.error(err)
  process.exit(1)
})
