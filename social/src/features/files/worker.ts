import cron from 'node-cron'
import { config } from '../../config'
import logger from '../../utils/logger'
import { cleanupUnlinkedFiles } from './cleanup'

const CLEANUP_CRON = '17 4 * * *'

export const startCleanupWorker = () => {
  if (!config.UPLOAD_CLEANUP_ENABLED) {
    logger.info('Upload cleanup worker is disabled')
    return {
      stop: async () => {},
    }
  }

  const task = cron.schedule(CLEANUP_CRON, () => {
    cleanupUnlinkedFiles().catch((err) => {
      logger.error({ err }, 'Upload cleanup worker failed')
    })
  })

  logger.info({ schedule: CLEANUP_CRON }, 'Upload cleanup worker started')

  return {
    stop: async () => {
      task.stop()
    },
  }
}
