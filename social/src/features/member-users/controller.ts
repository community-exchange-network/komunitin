import type { RequestHandler } from 'express'
import { getAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCode, getCollectionParams, getIdParam, getResourceParams } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import { badRequest } from '../../utils/error'
import type { PatchMemberUserBody } from './schema'
import { serializeMemberUser, serializeMemberUsers } from './serialize'
import { getMemberUser, listMemberUsers, patchMemberUser } from './service'

export const getMemberUsersRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const params = getCollectionParams(req, {
    filter: ['user', 'member'],
    sort: ['id'],
    include: ['user', 'member'],
  })
  const result = await listMemberUsers(ctx, code, params)
  const payload = await serializeMemberUsers(
    result.items,
    getCollectionSerializerOptions(req.url, params, result.total),
  )

  res.status(200).json(payload)
}

export const getMemberUserRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const id = getIdParam(req, 'id')
  const params = getResourceParams(req, { include: ['user', 'member'] })
  const relation = await getMemberUser(ctx, code, id, params)
  const payload = await serializeMemberUser(relation, params)

  res.status(200).json(payload)
}

export const patchMemberUserRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const id = getIdParam(req, 'id')
  const params = getResourceParams(req, { include: ['user', 'member'] })
  const body = getValidatedBody<PatchMemberUserBody>(req)

  if (body.data.id && body.data.id !== id) {
    throw badRequest('Resource id does not match route id')
  }

  const relation = await patchMemberUser(ctx, code, id, body.data.attributes, params)
  const payload = await serializeMemberUser(relation, params)

  res.status(200).json(payload)
}
