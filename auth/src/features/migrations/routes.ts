import express, { Router } from 'express'
import { socialServiceAuth } from '../../server/auth'
import { badRequest } from '../../utils/error'
import { importUsers } from './service'

const routes = Router()
routes.post('/migrations/users', socialServiceAuth, express.raw({ type: 'text/csv', limit: '100mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw badRequest('Expected users.csv with Content-Type: text/csv')
  res.json(await importUsers(req.body))
})
export default routes
