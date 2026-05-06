import type { RequestHandler } from 'express'
import { getAuthUserId, getOptionalAuthUserId, isSuperadmin } from '../../server/auth'
import { include } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import type { CreateGroupBody, PatchGroupBody } from './schema'
import { serializeGroup, serializeGroups, serializeGroupSettings } from './serialize'
import { createGroup, getGroupByCode, listGroups, patchGroupByCode } from './service'

export const postGroups: RequestHandler = async (req, res) => {
  const authUserId = getAuthUserId(req)
  const body = getValidatedBody<CreateGroupBody>(req)

  const attributes = body.data.attributes
  const settings = body.included?.find((resource) => resource.type === 'group-settings')?.attributes
  const currency = body.included?.find((resource) => resource.type === 'currencies')?.attributes

  const group = await createGroup({
    attributes,
    settings,
    currency,
  }, authUserId)

  const inc = include(req, ['settings'])
  const payload = await serializeGroup(group, inc)
  res.status(201).json(payload)
}

export const getGroups: RequestHandler = async (req, res) => {
  const groups = await listGroups()
  const inc = include(req, ['settings'])
  const payload = await serializeGroups(groups, inc)
  res.status(200).json(payload)
}

export const getGroupByCodeRoute: RequestHandler = async (req, res) => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code
  const authUserId = getOptionalAuthUserId(req)

  const group = await getGroupByCode(code, authUserId, isSuperadmin(req))

  const inc = include(req, ['settings'])

  const payload = await serializeGroup(group, inc)
  res.status(200).json(payload)
}

export const getGroupSettingsByCodeRoute: RequestHandler = async (req, res) => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code
  const authUserId = getAuthUserId(req)
  const group = await getGroupByCode(code, authUserId, isSuperadmin(req))

  const payload = await serializeGroupSettings(group)
  res.status(200).json(payload)
}

export const patchGroupByCodeRoute: RequestHandler = async (req, res) => {
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code
  const authUserId = getAuthUserId(req)
  const body = getValidatedBody<PatchGroupBody>(req)

  const group = await patchGroupByCode(code, body.data.attributes, authUserId, isSuperadmin(req))

  const payload = await serializeGroup(group)
  res.status(200).json(payload)
}
