import type { RequestHandler } from 'express'
import { getAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCollectionParams, getIdParam, getResourceParams } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import { serializeMembers } from '../members/serialize'
import type { CreateUserBody, PatchUserBody } from './schema'
import { unsubscribeQuerySchema } from './schema'
import { serializeUser, serializeUsers } from './serialize'
import { createUser, getUserById, listUserMembers, listUsers, patchUser, unsubscribeUser } from './service'
import { redeemUnsubscribeToken } from '../../clients/auth'
import { badRequest } from '../../utils/error'


export const getUsersRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)

  const params = getCollectionParams(req, {
    filter: ['members'],
    sort: ['created'],
  })

  const result = await listUsers(ctx, params)
  const payload = await serializeUsers(result.items, getCollectionSerializerOptions(req.url, params, result.total))

  res.status(200).json(payload)
}

export const postUsers: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const body = getValidatedBody<CreateUserBody>(req)
  const params = getResourceParams(req, {})

  const user = await createUser({
    id: ctx.userId,
    email: body.data.attributes?.email,
    name: body.data.attributes?.name,
    language: body.data.attributes?.language,
  })

  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}

export const getUsersMe: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const params = getResourceParams(req, {})
  
  const user = await getUserById(ctx, ctx.userId)
  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}

export const getUserByIdRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const requestedId = getIdParam(req, 'id')
  const params = getResourceParams(req, {})

  const user = await getUserById(ctx, requestedId)
  const payload = await serializeUser(user, params)
  res.status(200).json(payload)
}

export const getUserMembersRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const requestedId = getIdParam(req, 'id')
  const params = getCollectionParams(req, {
    sort: ['created', 'updated', 'name', 'code'],
    include: ['group', 'group.currency', 'account'],
  })

  const result = await listUserMembers(ctx, requestedId, params)
  const payload = await serializeMembers(
    result.items,
    getCollectionSerializerOptions(req.url, params, result.total)
  )

  res.status(200).json(payload)
}

export const patchUserRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const requestedId = getIdParam(req, 'id')
  const body = getValidatedBody<PatchUserBody>(req)

  const user = await patchUser(ctx, requestedId, body.data.attributes.language)
  const payload = await serializeUser(user)
  res.status(200).json(payload)
}

export const unsubscribeUserRoute: RequestHandler = async (req, res) => {
  const parsed = unsubscribeQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    throw badRequest('Invalid unsubscribe token')
  }

  const redeemed = await redeemUnsubscribeToken(parsed.data.token)
  await unsubscribeUser(redeemed.userId)
  res.status(204).send()
}
