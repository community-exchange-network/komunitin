import { Router } from 'express'
import { optionalUserAuth, userAuth } from '../../server/auth'
import { Scope } from '../../server/scopes'
import { validateBody } from '../../server/validation'
import {
  deleteCategoryRoute,
  getCategoriesRoute,
  patchCategoryRoute,
  postCategoriesRoute,
} from './controller'
import { createCategoryBodySchema, patchCategoryBodySchema } from './schema'

export const tenantCategoryRoutes = Router({ mergeParams: true })

tenantCategoryRoutes.get('/categories', optionalUserAuth(), getCategoriesRoute)
tenantCategoryRoutes.post('/categories', userAuth(Scope.SocialWrite), validateBody(createCategoryBodySchema), postCategoriesRoute)
tenantCategoryRoutes.patch('/categories/:category', userAuth(Scope.SocialWrite), validateBody(patchCategoryBodySchema), patchCategoryRoute)
tenantCategoryRoutes.delete('/categories/:category', userAuth(Scope.SocialWrite), deleteCategoryRoute)
