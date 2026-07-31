import { checkPrismaHealth } from '../utils/prisma'
import { checkRedisHealth } from '../utils/redis'

export const healthRoute = async (_req, res) => {
  try {
    await Promise.all([checkPrismaHealth(), checkRedisHealth()])
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'error' })
  }
}
