import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { httpLogger } from './server/http-logger'
import { errorHandler } from './server/errors'
import passwordRoutes from './routes/password'
import emailRoutes from './routes/email'
import healthRoutes from './routes/health'
import { createProvider } from './oidc/provider'
import logger from './utils/logger'
import { config } from './config'
import type { Server } from 'node:http'
import { rateLimit } from './utils/rate-limit'
import { disconnectPrisma } from './utils/prisma'

const app = express()
// Trust first proxy since we expect to be behind a load balancer in production,
// and this is required for correct client IP rate limiting.
app.set('trust proxy', 1)
const tokenRateLimit = rateLimit({ bucket: 'token' })

app.disable('x-powered-by')

app.use(helmet({
  contentSecurityPolicy: false,
}))

app.use(cors({
  origin: true,
  credentials: true,
}))

app.use(httpLogger)

app.use(healthRoutes)

app.use(passwordRoutes)
app.use(emailRoutes)

let providerMounted = false

export const initializeApp = async () => {
  if (!providerMounted) {
    const provider = await createProvider()
    app.use('/token', tokenRateLimit)
    app.use('/', provider.callback())
    app.use(errorHandler)
    providerMounted = true
  }

  return app
}

export const startServer = async () => {
  await initializeApp()

  const server = await new Promise<Server>((resolve, reject) => {
    const instance = app.listen(config.PORT, () => {
      logger.info(`Auth service listening on port ${config.PORT}`)
      resolve(instance)
    })
    instance.once('error', reject)
  })

  return {
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => err ? reject(err) : resolve())
      })
      await disconnectPrisma()
    },
  }
}

export { app }
