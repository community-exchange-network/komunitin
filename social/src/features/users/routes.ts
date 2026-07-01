import { Router } from 'express'
import { userAuth } from '../../server/auth'
import { validateBody } from '../../server/validation'
import { createUserBodySchema } from './schema'
import { getUserByIdRoute, getUsersMe, getUsersRoute, postUsers } from './controller'

const router = Router()

router.post('/users', userAuth(), validateBody(createUserBodySchema), postUsers)
router.get('/users', userAuth(), getUsersRoute)
router.get('/users/me', userAuth(), getUsersMe)
router.get('/users/:id', userAuth(), getUserByIdRoute)

export default router
