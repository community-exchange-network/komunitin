import { checkPrismaHealth } from '../utils/prisma'

export const healthRoute = async (_req, res) => {
  try {
    await checkPrismaHealth()
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'error' })
  }
}
