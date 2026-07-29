import { Router } from 'express'
import { userAuth } from '../../server/auth'
import { postUploadFileRoute } from './controller'

export const tenantFileRoutes = Router({ mergeParams: true })

tenantFileRoutes.post('/files/upload', userAuth(), postUploadFileRoute)
