import express from "express"
import { getRoutes } from "./routes"
import { getRoutes as getCCRoutes } from "src/creditcommons/routes"
import { getRoutes as getMigrationRoutes } from "src/migration/routes"
import { errorHandler } from "./errors"
import { httpLogger } from "../utils/logger"
import qs from "qs"
import helmet from "helmet"
import cors from "cors"
import { createBaseService } from "../controller/base-service-builder"
import { BaseService } from "../controller"


export type ExpressExtended = express.Express & { komunitin: { service: BaseService } }

export async function createApp() : Promise<ExpressExtended> {
  const app = express()
  return setupApp(app)
}

/*
 * Take an express app and set it up with the necessary middlewares and routes.
 */
export const setupApp = async (expressApp: express.Express) => {
  const app = expressApp as ExpressExtended
  app.disable('x-powered-by')
  app.set('query parser', (query: string) => {
    return qs.parse(query, {
      // parse comma-separated values into arrays.
      comma: true
    })
  })
  
  // Add some security headers.
  app.use(helmet())
  // Add CORS so this API can be called from any domain.
  app.use(cors({
    origin: true,
    credentials: true,
    exposedHeaders: ['Content-Disposition']
  }))

  // Express middlewares
  app.use(express.json({
    type: ['application/vnd.api+json', 'application/json']
  }))

  app.use((req, res, next) => {
    // The res.json function will add a "charset=utf-8" to this content type
    // header. This is annoying because it's not needed, but lets keep it.
    res.type('application/vnd.api+json')
    next()
  })

  // Logger
  app.use(httpLogger)

  // Controller
  const service = await createBaseService()
  app.komunitin = { service }
  
  // Routes
  app.use("/", getRoutes(service))
  app.use("/", getCCRoutes(service))
  app.use("/", getMigrationRoutes(service))
  

  // Error handlers
  app.use(errorHandler)

  return app
}

export const closeApp = async (app: ExpressExtended) => {
  await app.komunitin.service.stop()
}


