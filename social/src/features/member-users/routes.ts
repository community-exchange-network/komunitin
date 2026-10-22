import { Router } from 'express'
import { userAuth } from '../../server/auth'
import { Scope } from '../../server/scopes'
import { validateBody } from '../../server/validation'
import { getMemberUserRoute, getMemberUsersRoute, patchMemberUserRoute } from './controller'
import { patchMemberUserBodySchema } from './schema'

export const tenantMemberUserRoutes = Router({ mergeParams: true })

tenantMemberUserRoutes.get('/member-users', userAuth(Scope.SocialRead), getMemberUsersRoute)
tenantMemberUserRoutes.get('/member-users/:id', userAuth(Scope.SocialRead), getMemberUserRoute)
tenantMemberUserRoutes.patch(
  '/member-users/:id',
  userAuth(Scope.SocialWrite),
  validateBody(patchMemberUserBodySchema),
  patchMemberUserRoute,
)
