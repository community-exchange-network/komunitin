import { Router } from 'express'
import { checkPrismaHealth } from '../utils/prisma'

const router = Router()

router.get('/health', async (_req, res) => {
  res.type('application/json')
  try {
    await checkPrismaHealth()
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'error' })
  }
})

export default router
