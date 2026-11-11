import { Router } from 'express'
import { checkPrismaHealth } from '../utils/prisma'
import { checkRedisHealth } from '../utils/redis'

const router = Router()

router.get('/health', async (_req, res) => {
  try {
    await Promise.all([checkPrismaHealth(), checkRedisHealth()])
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'error' })
  }
})

export default router
