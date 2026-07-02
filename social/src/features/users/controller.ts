import type { RequestHandler } from 'express'
import { getAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCollectionParams, getIdParam, getResourceParams } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import type { CreateUserBody } from './schema'
import { serializeUser, serializeUsers } from './serialize'
import { createUser, getUserById, listUsers } from './service'


export const getUsersRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)

  const params = getCollectionParams(req, {
    filter: ['members'],
    sort: ['created'],
    include: ['settings'],
  })

  const users = await listUsers(ctx, params)
  const payload = await serializeUsers(users, getCollectionSerializerOptions(req.url, params, users.length))

  res.status(200).json(payload)
}

export const postUsers: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const body = getValidatedBody<CreateUserBody>(req)
  const userSettings = body.included?.find((resource) => resource.type === 'user-settings')?.attributes
  const params = getResourceParams(req, { include: ['settings'] })

  const user = await createUser({
    id: ctx.userId,
    email: body.data.attributes?.email,
    name: body.data.attributes?.name,
    settings: userSettings,
  })

  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}

export const getUsersMe: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const params = getResourceParams(req, { include: ['settings'] })  
  
  const user = await getUserById(ctx, ctx.userId)
  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}

export const getUserByIdRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const requestedId = getIdParam(req, 'id')
  const params = getResourceParams(req, { include: ['settings'] })

  const user = await getUserById(ctx, requestedId)
  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}
