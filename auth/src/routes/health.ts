import { Router } from 'express'
import { checkPrismaHealth } from '../utils/prisma'

const router = Router()

export const healthRoute = async (_req, res) => {
  try {
    await checkPrismaHealth()
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'error' })
  }
}

router.get('/health', healthRoute)

export default router
