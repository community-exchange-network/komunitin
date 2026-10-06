import { Router } from 'express'
import { optionalUserAuth, userAuth } from '../../server/auth'
import { Scope } from '../../server/scopes'
import { validateBody } from '../../server/validation'
import { createGroupBodySchema, patchGroupBodySchema, patchGroupSettingsBodySchema } from './schema'
import { deleteGroupByCodeRoute, getGroupAdminsRoute, getGroupByCodeRoute, getGroupSettingsByCodeRoute, getGroups, patchGroupByCodeRoute, patchGroupSettingsByCodeRoute, postGroups } from './controller'

// To be mounted at /
export const groupsRoutes = Router()
groupsRoutes.post('/groups', userAuth(Scope.SocialWrite), validateBody(createGroupBodySchema), postGroups)
groupsRoutes.get('/groups', optionalUserAuth(), getGroups)

// To be mounted at /:code
export const tenantGroupRoutes = Router({ mergeParams: true })
tenantGroupRoutes.get('/', optionalUserAuth(), getGroupByCodeRoute)
tenantGroupRoutes.patch('/', userAuth(Scope.SocialWrite), validateBody(patchGroupBodySchema), patchGroupByCodeRoute)
tenantGroupRoutes.delete('/', userAuth(Scope.SocialWrite), deleteGroupByCodeRoute)
tenantGroupRoutes.get('/admins', userAuth(Scope.SocialRead), getGroupAdminsRoute)
tenantGroupRoutes.get('/settings', optionalUserAuth(), getGroupSettingsByCodeRoute)
tenantGroupRoutes.patch('/settings', userAuth(Scope.SocialWrite), validateBody(patchGroupSettingsBodySchema), patchGroupSettingsByCodeRoute)
