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
  requestMemberDeletionRoute,
} from './controller'
import { createMemberBodySchema, patchMemberBodySchema } from './schema'

export const tenantMemberRoutes = Router({ mergeParams: true })

tenantMemberRoutes.get('/members', optionalUserAuth(), getMembersRoute)
tenantMemberRoutes.post('/members', userAuth(Scope.SocialWrite), validateBody(createMemberBodySchema), postMembersRoute)
tenantMemberRoutes.get('/members/:member', optionalUserAuth(), getMemberRoute)
tenantMemberRoutes.patch('/members/:member', userAuth(Scope.SocialWrite), validateBody(patchMemberBodySchema), patchMemberRoute)
tenantMemberRoutes.post('/members/:member/request-deletion', userAuth(Scope.SocialWrite), requestMemberDeletionRoute)
tenantMemberRoutes.delete('/members/:member', optionalUserAuth(Scope.SocialWrite), deleteMemberRoute)
