import type { RequestHandler } from 'express'
import { getAuthContext, getOptionalAuthContext } from '../../server/context'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'
import { getCode, getCollectionParams, getInclude } from '../../server/request'
import { getValidatedBody } from '../../server/validation'
import type { CreateGroupBody, PatchGroupBody, PatchGroupSettingsBody } from './schema'
import { serializeGroup, serializeGroups, serializeGroupSettings } from './serialize'
import { createGroup, getGroupByCode, listGroups, patchGroupByCode, patchGroupSettingsByCode } from './service'

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

  const include = getInclude(req, ['settings'])
  const payload = await serializeGroup(group, { include })
  res.status(201).json(payload)
}

export const getGroups: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const params = getCollectionParams(req, {
    filter: ['code', 'name', 'status', 'access', 'search'],
    sort: ['created', 'updated', 'name', 'code'],
    include: ['settings'],
  })

  const groups = await listGroups(ctx, params)
  
  const payload = await serializeGroups(groups, getCollectionSerializerOptions(req.url, params, groups.length))

  res.status(200).json(payload)
}

export const getGroupByCodeRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const include = getInclude(req, ['settings'])

  const group = await getGroupByCode(ctx, code)

  const payload = await serializeGroup(group, { include })
  res.status(200).json(payload)
}

export const getGroupSettingsByCodeRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)

  const group = await getGroupByCode(ctx, code)

  const payload = await serializeGroupSettings(group)
  res.status(200).json(payload)
}

export const patchGroupByCodeRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const body = getValidatedBody<PatchGroupBody>(req)

  const group = await patchGroupByCode(ctx, code, body.data.attributes)

  const payload = await serializeGroup(group)
  res.status(200).json(payload)
}

export const patchGroupSettingsByCodeRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const body = getValidatedBody<PatchGroupSettingsBody>(req)

  const group = await patchGroupSettingsByCode(ctx, code, body.data.attributes)

  const payload = await serializeGroupSettings(group)
  res.status(200).json(payload)
}
