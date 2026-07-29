import { Router } from 'express'
import { optionalUserAuth, userAuth } from '../../server/auth'
import { Scope } from '../../server/scopes'
import { validateBody } from '../../server/validation'
import {
  deleteMemberRoute,
  getMemberRoute,
  getMembersRoute,
  patchMemberRoute,
  postMembersRoute,
} from './controller'
import { createMemberBodySchema, patchMemberBodySchema } from './schema'

export const tenantMemberRoutes = Router({ mergeParams: true })

tenantMemberRoutes.get('/members', optionalUserAuth(), getMembersRoute)
tenantMemberRoutes.post('/members', userAuth(Scope.SocialWrite), validateBody(createMemberBodySchema), postMembersRoute)
tenantMemberRoutes.get('/members/:member', optionalUserAuth(), getMemberRoute)
tenantMemberRoutes.patch('/members/:member', userAuth(Scope.SocialWrite), validateBody(patchMemberBodySchema), patchMemberRoute)
tenantMemberRoutes.delete('/members/:member', userAuth(Scope.SocialWrite), deleteMemberRoute)
