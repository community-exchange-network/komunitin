import { Router } from 'express'
import { optionalUserAuth, userAuth } from '../../server/auth'
import { Scope } from '../../server/scopes'
import { validateBody } from '../../server/validation'
import {
  deletePostRoute,
  getPostRoute,
  getPostsRoute,
  patchPostRoute,
  postPostsRoute,
} from './controller'
import { createPostBodySchema, patchPostBodySchema } from './schema'

export const tenantPostRoutes = Router({ mergeParams: true })

tenantPostRoutes.get('/posts', optionalUserAuth(), getPostsRoute)
tenantPostRoutes.post('/posts', userAuth(Scope.SocialWrite), validateBody(createPostBodySchema), postPostsRoute)
tenantPostRoutes.get('/posts/:post', optionalUserAuth(), getPostRoute)
tenantPostRoutes.patch('/posts/:post', userAuth(Scope.SocialWrite), validateBody(patchPostBodySchema), patchPostRoute)
tenantPostRoutes.delete('/posts/:post', userAuth(Scope.SocialWrite), deletePostRoute)
