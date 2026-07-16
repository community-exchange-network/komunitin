import { Router } from 'express'
import { userAuth } from '../../server/auth'
import { Scope } from '../../server/scopes'
import { validateBody } from '../../server/validation'
import { createUserBodySchema, patchUserSettingsBodySchema } from './schema'
import {
  getUserByIdRoute,
  getUserMembersRoute,
  getUserSettingsRoute,
  getUsersMe,
  getUsersRoute,
  patchUserSettingsRoute,
  postUsers,
} from './controller'

const router = Router()

router.post('/users', userAuth(Scope.SocialWrite), validateBody(createUserBodySchema), postUsers)
router.get('/users', userAuth(Scope.SocialRead), getUsersRoute)
router.get('/users/me', userAuth(Scope.SocialRead), getUsersMe)
router.get('/users/:id/members', userAuth(Scope.SocialRead), getUserMembersRoute)
router.get('/users/:id/settings', userAuth(Scope.SocialRead), getUserSettingsRoute)
router.patch('/users/:id/settings', userAuth(Scope.SocialWrite), validateBody(patchUserSettingsBodySchema), patchUserSettingsRoute)
router.get('/users/:id', userAuth(Scope.SocialRead), getUserByIdRoute)

export default router
