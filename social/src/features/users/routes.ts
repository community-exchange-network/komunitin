import { Router } from 'express'
import { userAuth } from '../../server/auth'
import { Scope } from '../../server/scopes'
import { validateBody } from '../../server/validation'
import { createUserBodySchema, patchUserBodySchema } from './schema'
import {
  getUserByIdRoute,
  getUserMembersRoute,
  getUsersMe,
  patchUserRoute,
  postUsers,
  unsubscribeUserRoute,
} from './controller'

const router = Router()

router.post('/users', userAuth(Scope.SocialWrite), validateBody(createUserBodySchema), postUsers)
router.post('/users/unsubscribe', unsubscribeUserRoute)
router.get('/users/me', userAuth(Scope.SocialRead), getUsersMe)
router.get('/users/:id/members', userAuth(Scope.SocialRead), getUserMembersRoute)
router.patch('/users/:id', userAuth(Scope.SocialWrite), validateBody(patchUserBodySchema), patchUserRoute)
router.get('/users/:id', userAuth(Scope.SocialRead), getUserByIdRoute)

export default router
