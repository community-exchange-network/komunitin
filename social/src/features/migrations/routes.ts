import { Router } from 'express'
import { userAuth } from '../../server/auth'
import { getAuthContext, Scope } from '../../server/context'
import { forbidden } from '../../utils/error'
import { createMigration, getMigration, listMigrations, migrationEvents } from './controller'

const routes = Router()
routes.use('/migrations', userAuth(Scope.Superadmin), (req, _res, next) => {
  if (!getAuthContext(req).isSuperadmin) throw forbidden('Migrations require a superadmin user')
  next()
})
routes.post('/migrations', createMigration)
routes.get('/migrations', listMigrations)
routes.get('/migrations/:id', getMigration)
routes.get('/migrations/:id/events', migrationEvents)
export default routes
