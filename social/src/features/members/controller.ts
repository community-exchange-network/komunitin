import type { RequestHandler } from 'express'
import { getAuthContext, getOptionalAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCollectionParams, getCode, getParam } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import type { CreateMemberBody, PatchMemberBody } from './schema'
import { serializeMember, serializeMembers } from './serialize'
import { createMember, getMember, listMembers, patchMember } from './service'

export const getMembersRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const params = getCollectionParams(req, {
    filter: ['code', 'name', 'type', 'status', 'access', 'search'],
    sort: ['created', 'updated', 'name', 'code'],
  })

  const members = await listMembers(ctx, code, params)

  const payload = await serializeMembers(
    members,
    getCollectionSerializerOptions(req.url, params, members.length)
  )

  res.status(200).json(payload)
}

export const getMemberRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const memberId = getParam(req, 'member')

  const member = await getMember(ctx, code, memberId)

  const payload = await serializeMember(member)
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
  const memberId = getParam(req, 'member')
  const body = getValidatedBody<PatchMemberBody>(req)

  const member = await patchMember(ctx, code, memberId, body.data.attributes)

  const payload = await serializeMember(member)
  res.status(200).json(payload)
}
