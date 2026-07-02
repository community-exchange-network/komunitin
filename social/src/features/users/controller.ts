import type { RequestHandler } from 'express'
import { getAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCollectionParams, getIdParam, getResourceParams } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import { serializeMembers } from '../members/serialize'
import type { CreateUserBody, PatchUserSettingsBody } from './schema'
import { serializeUser, serializeUsers, serializeUserSettings } from './serialize'
import { createUser, getUserById, listUserMembers, listUsers, patchUserSettings } from './service'


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

export const getUserMembersRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const requestedId = getParam(req, 'id')
  const params = getCollectionParams(req, {
    sort: ['created', 'updated', 'name', 'code'],
    include: ['group', 'group.currency', 'account'],
  })

  const members = await listUserMembers(ctx, requestedId, params)
  const payload = await serializeMembers(
    members,
    getCollectionSerializerOptions(req.url, params, members.length)
  )

  res.status(200).json(payload)
}

export const getUserSettingsRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const requestedId = getParam(req, 'id')

  const user = await getUserById(ctx, requestedId)
  const payload = await serializeUserSettings(user)
  res.status(200).json(payload)
}

export const patchUserSettingsRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const requestedId = getParam(req, 'id')
  const body = getValidatedBody<PatchUserSettingsBody>(req)

  const user = await patchUserSettings(ctx, requestedId, body.data.attributes)
  const payload = await serializeUserSettings(user)
  res.status(200).json(payload)
}
