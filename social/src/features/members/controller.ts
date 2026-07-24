import type { RequestHandler } from 'express'
import { getAuthContext, getOptionalAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCollectionParams, getCode, getIdParam, getResourceParams } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import type { CreateMemberBody, PatchMemberBody } from './schema'
import { serializeMember, serializeMembers } from './serialize'
import { createMember, deleteMember, getMember, listMembers, patchMember } from './service'

export const getMembersRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const params = getCollectionParams(req, {
    filter: ['code', 'name', 'type', 'status', 'access', 'account', 'search'],
    sort: ['created', 'updated', 'name', 'code', 'distance'],
    include: ['group', 'account'],
    near: true,
  })

  const result = await listMembers(ctx, code, params)

  const payload = await serializeMembers(
    result.items,
    getCollectionSerializerOptions(req.url, params, result.total)
  )

  res.status(200).json(payload)
}

export const getMemberRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const memberId = getIdParam(req, 'member')
  const params = getResourceParams(req, { include: ['group', 'account'] })

  const member = await getMember(ctx, code, memberId)

  const payload = await serializeMember(member, params)
  res.status(200).json(payload)
}

export const postMembersRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const body = getValidatedBody<CreateMemberBody>(req)

  const member = await createMember(ctx, code, body.data.attributes)

  const payload = await serializeMember(member)
  res.status(201).json(payload)
}

export const patchMemberRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const memberId = getIdParam(req, 'member')
  const body = getValidatedBody<PatchMemberBody>(req)

  const member = await patchMember(ctx, code, memberId, body.data.attributes)

  const payload = await serializeMember(member)
  res.status(200).json(payload)
}

export const deleteMemberRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const memberId = getIdParam(req, 'member')

  await deleteMember(ctx, code, memberId)
  res.status(204).send()
}
