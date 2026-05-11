import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import qs from 'qs'
import { errorHandler } from './server/errors'
import { httpLogger } from './server/http-logger'
import { config } from './config'
import logger from './utils/logger'
import userRoutes from './features/users/routes'
import { groupsRoutes, tenantGroupRoutes } from './features/groups/routes'
import { tenantCategoryRoutes } from './features/categories/routes'
import { tenantMemberRoutes } from './features/members/routes'
import { tenantPostRoutes } from './features/posts/routes'

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
app.use((req, res, next) => {
  res.type('application/vnd.api+json')
  next()
})

app.use(httpLogger)

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/', userRoutes)
app.use('/', groupsRoutes)
app.use('/:code', tenantGroupRoutes)
app.use('/:code', tenantCategoryRoutes)
app.use('/:code', tenantMemberRoutes)
app.use('/:code', tenantPostRoutes)

app.use(errorHandler)

export const startServer = () => {
  const server = app.listen(config.PORT, () => {
    logger.info(`Social service listening on port ${config.PORT}`)
  })

  return {
    stop: () => new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve())
    })
  }
}

export { app }
