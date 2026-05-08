import type { RequestHandler } from 'express'
import { getAuthContext, getOptionalAuthContext } from '../../server/context'
import { getInclude } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import type { CreateGroupBody, PatchGroupBody } from './schema'
import { serializeGroup, serializeGroups, serializeGroupSettings } from './serialize'
import { createGroup, getGroupByCode, listGroups, patchGroupByCode } from './service'

export const postGroups: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const body = getValidatedBody<CreateGroupBody>(req)

  const attributes = body.data.attributes
  const settings = body.included?.find((resource) => resource.type === 'group-settings')?.attributes
  const currency = body.included?.find((resource) => resource.type === 'currencies')?.attributes

  const group = await createGroup(ctx, {
    attributes,
    settings,
    currency,
  })

  const inc = getInclude(req, ['settings'])
  const payload = await serializeGroup(group, inc)
  res.status(201).json(payload)
}

export const getGroups: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const groups = await listGroups(ctx)
  const inc = getInclude(req, ['settings'])
  const payload = await serializeGroups(groups, inc)
  res.status(200).json(payload)
}

export const getGroupByCodeRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code

  const group = await getGroupByCode(ctx, code)

  const inc = getInclude(req, ['settings'])

  const payload = await serializeGroup(group, inc)
  res.status(200).json(payload)
}

export const getGroupSettingsByCodeRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code

  const group = await getGroupByCode(ctx, code)

  const payload = await serializeGroupSettings(group)
  res.status(200).json(payload)
}

export const patchGroupByCodeRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code
  const body = getValidatedBody<PatchGroupBody>(req)

  const group = await patchGroupByCode(ctx, code, body.data.attributes)

  const payload = await serializeGroup(group)
  res.status(200).json(payload)
}
