import pino from 'pino'
import { config } from '../config'

const logger = pino({
  transport: config.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      }
    : undefined,
})

export default logger
