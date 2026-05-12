import { Router } from 'express'
import { optionalUserAuth, userAuth } from '../../server/auth'
import { validateBody } from '../../server/validation'
import { createGroupBodySchema, patchGroupBodySchema, patchGroupSettingsBodySchema } from './schema'
import { getGroupByCodeRoute, getGroupSettingsByCodeRoute, getGroups, patchGroupByCodeRoute, patchGroupSettingsByCodeRoute, postGroups } from './controller'

// To be mounted at /
export const groupsRoutes = Router()
groupsRoutes.post('/groups', userAuth(), validateBody(createGroupBodySchema), postGroups)
groupsRoutes.get('/groups', optionalUserAuth(), getGroups)

// To be mounted at /:code
export const tenantGroupRoutes = Router({ mergeParams: true })
tenantGroupRoutes.get('/', optionalUserAuth(), getGroupByCodeRoute)
tenantGroupRoutes.patch('/', userAuth(), validateBody(patchGroupBodySchema), patchGroupByCodeRoute)
tenantGroupRoutes.get('/settings', optionalUserAuth(), getGroupSettingsByCodeRoute)
tenantGroupRoutes.patch('/settings', userAuth(), validateBody(patchGroupSettingsBodySchema), patchGroupSettingsByCodeRoute)
