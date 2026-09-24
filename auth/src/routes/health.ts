import { Router } from 'express'
import { serviceUnavailable } from '../utils/error'
import { checkPrismaHealth } from '../utils/prisma'

const router = Router()

router.get('/health', async (req, res, next) => {
  try {
    await checkPrismaHealth()
    res.json({ status: 'ok' })
  } catch (err) {
    next(serviceUnavailable('Database unavailable', { cause: err }))
  }
})

export default router
