import { Router } from 'express'
import { BaseService } from '../controller'
import { checkPrismaHealth } from '../utils/prisma'

/** Health route for this service's database client. */
export const getHealthRoutes = (service: BaseService) => {
  const router = Router()

  router.get('/health', async (_req, res) => {
    res.type('application/json')
    try {
      await checkPrismaHealth(service.privilegedDb())
      res.json({ status: 'ok' })
    } catch {
      res.status(503).json({ status: 'error' })
    }
  })

  return router
}
