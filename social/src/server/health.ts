import { Router } from 'express'

const router = Router()

router.get('/health', (_req, res) => {
  res.type('application/json')
  res.json({ status: 'ok' })
})

export default router
