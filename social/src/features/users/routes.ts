import { Router } from 'express'
import { userAuth } from '../../server/auth'
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

router.post('/users', userAuth(), validateBody(createUserBodySchema), postUsers)
router.get('/users', userAuth(), getUsersRoute)
router.get('/users/me', userAuth(), getUsersMe)
router.get('/users/:id/members', userAuth(), getUserMembersRoute)
router.get('/users/:id/settings', userAuth(), getUserSettingsRoute)
router.patch('/users/:id/settings', userAuth(), validateBody(patchUserSettingsBodySchema), patchUserSettingsRoute)
router.get('/users/:id', userAuth(), getUserByIdRoute)

export default router
