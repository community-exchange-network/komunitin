import express from 'express'
import cors from 'cors'
import { config } from './config'
import notificationsRouter from './notifications/server/routes'
import logger from './utils/logger'
import { errorHandler } from './server/errors'

const app = express()

app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(express.json())

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
