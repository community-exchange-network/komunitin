import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import qs from 'qs'
import { config } from './config'
import notificationsRouter from './notifications/server/routes'
import { errorHandler } from './server/errors'
import { httpLogger } from './server/http-logger'
import logger from './utils/logger'

const app = express()

app.disable('x-powered-by')
app.set('query parser', (query: string) => {
  return qs.parse(query, {
    // parse comma-separated values into arrays.
    comma: true
  })
})

app.use(helmet())
app.use(cors({
  origin: true,
  credentials: true,
}))

app.use(express.json({
  type: ['application/vnd.api+json', 'application/json']
}))

app.use(httpLogger)

app.use(notificationsRouter)

app.get('/health', (req, res) => {
  res.send('OK')
})

app.use(errorHandler)

export const _app = app

export const startServer = () => {
  const server = app.listen(config.PORT, () => {
    logger.info(`Server listening on port ${config.PORT}`)
  })
  
  return {
    stop: async () => {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
  }
}
