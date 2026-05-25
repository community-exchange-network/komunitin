import { InputJsonObject } from '@prisma/client/runtime/client'
import { Group as DbGroup, Prisma } from '../../generated/prisma/client'
import { GroupUpdateInput } from '../../generated/prisma/models'
import { AuthContext, OptionalAuthContext } from '../../server/context'
import { createAccountingCurrency, getAccountingCurrencyByCode } from '../../server/accounting'
import { privilegedDb, tenantDb } from '../../server/multitenant'
import { reorderByIds } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma, { toNullableJsonInput } from '../../utils/prisma'
import { syncResourceFiles } from '../files/service'
import { Address, Location, PatchGroupAttributes, PatchGroupSettingsAttributes } from './schema'
import { findGroupIds } from './sql'
import type { CreateGroupInput, Group, GroupMeta } from './types'

type WithAddressAndCoords = Pick<DbGroup, 'address' | 'latitude' | 'longitude'>

export const toLocation = (entity: WithAddressAndCoords): Location | null => {
  if (entity.longitude === null || entity.latitude === null) {
    return null
  }
  const address = entity.address as Address | null

  return {
    name: address?.addressLocality || address?.addressRegion || address?.addressCountry || undefined,
    type: 'Point',
    coordinates: [entity.longitude, entity.latitude],
  }
}

const getGroupMeta = (group: Pick<DbGroup, 'meta'>): GroupMeta => {
  return (group.meta ?? {}) as GroupMeta
}

const getRequestedCurrency = (group: Pick<DbGroup, 'meta' | 'tenantId'>) => {
  return {
    ...(getGroupMeta(group).request?.currency ?? {}),
    code: group.tenantId,
  }
}

const getGroupAdminUserIds = async (group: Pick<DbGroup, 'id' | 'tenantId'>): Promise<string[]> => {
  const db = tenantDb(prisma, group.tenantId)
  const admins = await db.groupAdminUser.findMany({
    where: {
      groupId: group.id,
    },
    select: {
      userId: true,
    },
  })

  return admins.map((admin) => admin.userId)
}

export const assertAtMostOneGroupAdmin = async (group: Pick<DbGroup, 'id' | 'tenantId'>): Promise<void> => {
  const adminUserIds = await getGroupAdminUserIds(group)
  if (adminUserIds.length > 1) {
    throw badRequest('Group cannot have more than one admin')
  }
}

export const fromLocation = (location?: Location | null): { latitude: number|null; longitude: number|null } => {
  return {
    latitude: location?.coordinates[1] ?? null,
    longitude: location?.coordinates[0] ?? null,
  }
}

/**
 * Map database model to Group type, ready to be serialized and sent in API responses.
 */
export const toGroup = (group: DbGroup): Group => {
  return {
    ...group,
    code: group.tenantId,
    location: toLocation(group),
  } as Group
}

/**
 * Create a pending new group with the given attributes. The creating user will be set as group admin. 
 * The group will need to be activated by a superadmin before it becomes visible and usable.
 */
export const createGroup = async (ctx: AuthContext, input: CreateGroupInput): Promise<Group> => {
  const db = tenantDb(prisma, input.attributes.code)

  const existing = await db.group.findFirst()
  if (existing) {
    throw badRequest('A group with this code already exists')
  }
  const attributes = input.attributes
  const location = fromLocation(attributes.location)

  const createData =  {
    tenantId: attributes.code,
    status: 'pending',
    name: attributes.name,
    description: attributes.description ?? '',
    access: attributes.access ?? 'public',
    image: toNullableJsonInput(attributes.image),
    address: attributes.address,
    contacts: attributes.contacts,
    latitude: location.latitude,
    longitude: location.longitude,
    
    settings: input.settings,
    meta: {
      request: {
        currency: input.currency,
      }
    } as InputJsonObject,
  }

  const group = await db.transaction(async (tx) => {
    const created = await tx.group.create({ data: createData })

    await tx.groupAdminUser.create({
      data: {
        tenantId: attributes.code,
        groupId: created.id,
        userId: ctx.userId,
        role: 'admin',
      }
    })

    return created
  })

  await syncResourceFiles(attributes.code, 'groups', group.id, attributes.image ? [attributes.image.url] : [])

  return toGroup(group)
}

export const isGroupAdmin = async (ctx: OptionalAuthContext, group: Pick<Group, 'id' | 'code'>): Promise<boolean> => {
  if (!ctx.userId) {
    return false
  }

  const db = tenantDb(prisma, group.code)
  const relation = await db.groupAdminUser.findFirst({
    where: {
      groupId: group.id,
      userId: ctx.userId,
    }
  })

  return Boolean(relation)
}

export const isGroupMember = async (ctx: OptionalAuthContext, group: Pick<Group, 'id' | 'code'>): Promise<boolean> => {
  if (!ctx.userId) {
    return false
  }

  const db = tenantDb(prisma, group.code)
  const relation = await db.memberUser.findFirst({
    where: {
      userId: ctx.userId,
      member: {
        groupId: group.id,
        deleted: null,
      },
    }
  })

  return Boolean(relation)
}

export const canReadGroup = async (ctx: OptionalAuthContext, group: Group): Promise<boolean> => {
  return ctx.isSuperadmin
    || (group.status === 'active' && group.access === 'public')
    || await isGroupMember(ctx, group)
    || await isGroupAdmin(ctx, group)
}

export const canWriteGroup = async (ctx: AuthContext, group: Group): Promise<boolean> => {
  return ctx.isSuperadmin || await isGroupAdmin(ctx, group)
}

/**
 * Return all groups accessible to the given user.
 * 
 * If no status filter is provided, defaults to 'active' groups only.
 */
export const listGroups = async (ctx: OptionalAuthContext, params: CollectionParams): Promise<Group[]> => {
  const db = privilegedDb(prisma)

  const defaultFilters = {
    status: 'active'
  }
  
  const ids = await findGroupIds(ctx, db, {
    ...params,
    filters: {
      ...defaultFilters,
      ...params.filters,
    }
  })

  if (ids.length === 0) {
    return []
  }

  const groups = await db.group.findMany({
    where: {
      id: { in: ids },
    }
  })

  return reorderByIds(groups, ids).map(toGroup)
}

export const getGroupByCode = async (
  ctx: OptionalAuthContext,
  code: string
): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const dbGroup = await db.group.findFirst()
  if (!dbGroup) {
    throw notFound('Group not found')
  }

  const group = toGroup(dbGroup)

  const allowed = await canReadGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have access to this group')
  }

  return group
}

export const patchGroupByCode = async (ctx: AuthContext, code: string, attributes: PatchGroupAttributes): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const group = await db.group.findFirst()

  if (!group) {
    throw notFound('Group not found')
  }

  const allowed = await canWriteGroup(ctx, toGroup(group))
  if (!allowed) {
    throw forbidden('You do not have permission to update this group')
  }

  if (typeof attributes.status === 'string') {
    if (!ctx.isSuperadmin || attributes.status !== 'active' || group.status !== 'pending') {
      throw badRequest('Status transition is not allowed')
    }

    const requestedCurrency = getRequestedCurrency(group)
    const adminUserIds = await getGroupAdminUserIds(group)
    if (adminUserIds.length !== 1) {
      throw badRequest('Group must have exactly one admin before activation')
    }
    const linkedCurrency = await getAccountingCurrencyByCode(group.tenantId, ctx.authorization)
      ?? await createAccountingCurrency(requestedCurrency, adminUserIds, ctx.authorization)

    const updated = await db.group.update({
      where: { id: group.id },
      data: {
        status: 'active',
        currencyId: linkedCurrency.id,
      },
    })

    return toGroup(updated)
  }

  const { location, image, ...rest } = attributes
  const data: GroupUpdateInput = {
    ...rest,
    image: toNullableJsonInput(image),
  }

  if (attributes.location !== undefined) {
    const location = fromLocation(attributes.location)
    data.latitude = location.latitude
    data.longitude = location.longitude
  }

  const updated = await db.group.update({
    where: { id: group.id },
    data,
  })

  if (attributes.image !== undefined) {
    await syncResourceFiles(code, 'groups', group.id, attributes.image ? [attributes.image.url] : [])
  }

  return toGroup(updated)
}

export const patchGroupSettingsByCode = async (
  ctx: AuthContext,
  code: string,
  attributes: PatchGroupSettingsAttributes,
): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const group = await db.group.findFirst()

  if (!group) {
    throw notFound('Group not found')
  }

  const allowed = await canWriteGroup(ctx, toGroup(group))
  if (!allowed) {
    throw forbidden('You do not have permission to update this group')
  }

  const currentSettings = group.settings as Prisma.JsonObject || {}
  const mergedSettings: Prisma.InputJsonObject = {
    ...currentSettings,
    ...attributes,
  }

  const updated = await db.group.update({
    where: { id: group.id },
    data: {
      settings: mergedSettings,
    },
  })

  return toGroup(updated)
}
