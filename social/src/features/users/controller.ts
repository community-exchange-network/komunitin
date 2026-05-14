import type { RequestHandler } from 'express'
import { forbidden } from '../../utils/error'
import { getAuthUserId } from '../../server/auth'
import { getValidatedBody } from '../../server/validation'
import { serializeUser } from './serialize'
import type { CreateUserBody } from './schema'
import { createUser, getUserById } from './service'
import { getResourceParams } from '../../server/request'

export const postUsers: RequestHandler = async (req, res) => {
  const authUserId = getAuthUserId(req)
  const body = getValidatedBody<CreateUserBody>(req)

  const userSettings = body.included?.find((resource) => resource.type === 'user-settings')?.attributes

  const user = await createUser({
    id: authUserId,
    email: body.data.attributes?.email,
    name: body.data.attributes?.name,
    settings: userSettings,
  })

  const params = getResourceParams(req, { include: ['settings'] })
  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}

export const getUsersMe: RequestHandler = async (req, res) => {
  const authUserId = getAuthUserId(req)
  const user = await getUserById(authUserId)

  const params = getResourceParams(req, { include: ['settings'] })  
  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}

export const getUserByIdRoute: RequestHandler = async (req, res) => {
  const authUserId = getAuthUserId(req)
  const requestedId = req.params.id

  if (requestedId !== authUserId) {
    throw forbidden('You can only access your own user resource')
  }

  const user = await getUserById(requestedId)
  const params = getResourceParams(req, { include: ['settings'] })
  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}
