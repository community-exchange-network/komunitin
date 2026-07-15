import { InputJsonObject } from '@prisma/client/runtime/client'
import { Group as DbGroupRaw, GroupAdminUser, Prisma } from '../../generated/prisma/client'
import { GroupUpdateInput } from '../../generated/prisma/models'
import { AuthContext, OptionalAuthContext } from '../../server/context'
import { createAccountingClient, Currency } from '../../clients/accounting'
import { privilegedDb, tenantDb } from '../../server/multitenant'
import { reorderByIds } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, internalError, notFound } from '../../utils/error'
import prisma, { toNullableJsonInput } from '../../utils/prisma'
import { syncResourceFiles } from '../files/service'
import { Address, Location, PatchGroupAttributes, PatchGroupSettingsAttributes } from './schema'
import { findGroupIds } from './sql'
import type { CreateGroupInput, Group, GroupMeta } from './types'
import { createNotificationsClient } from '../../clients/notifications'

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

export const fromLocation = (location?: Location | null): { latitude: number|null; longitude: number|null } => {
  return {
    latitude: location?.coordinates[1] ?? null,
    longitude: location?.coordinates[0] ?? null,
  }
}

// This is the type we get from db fetches including the admins relation.
export type DbGroup = DbGroupRaw & {
  admins: GroupAdminUser[]
}
/**
 * Map database model to Group type, ready to be serialized and sent in API responses.
 */
export const toGroup = (group: DbGroup): Group => {
  return {
    ...group,
    code: group.tenantId,
    admins: group.admins.map((admin) => ({ id: admin.userId, role: admin.role })),
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

  const dbGroup = await db.transaction(async (tx) => {
    const created = await tx.group.create({ data: createData })

    const admin = await tx.groupAdminUser.create({
      data: {
        tenantId: attributes.code,
        groupId: created.id,
        userId: ctx.userId,
        role: 'admin',
      }
    })

    return {
      ...created,
      admins: [admin],
    }
  })

  const group = toGroup(dbGroup)

  await syncResourceFiles(attributes.code, 'groups', group.id, attributes.image ? [attributes.image.url] : [])

  const notifications = createNotificationsClient(ctx)
  await notifications.notifyGroupRequested(group)

  return group
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
    || ctx.canReadAllSocial
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
    status: ['active']
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
    },
    include: {
      admins: true
    },
  })

  return reorderByIds(groups, ids).map(toGroup)
}

export const getGroupByCode = async (
  ctx: OptionalAuthContext,
  code: string
): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const dbGroup = await db.group.findFirst({
    where: {
      deleted: null,
    },
    include: {
      admins: true
    },
  })
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

const syncCurrencyStatus = async (ctx: AuthContext, group: Group, status: Currency["status"]): Promise<Currency> => {
  const accounting = createAccountingClient(ctx)
  const currencyCode = getCurrencyCode(group)
  let currency = await accounting.findCurrencyByCode(currencyCode)
  if (!currency) {
    // Create currency
    const requestedCurrency = getRequestedCurrency(group)
    const adminUserIds = group.admins.map((admin) => admin.id)
    
    currency = await accounting.createCurrency({
      ...requestedCurrency,
      code: currencyCode,
      status: 'active',
    }, adminUserIds)
  }
  // Update currency status if needed
  if (currency.status !== status) {
    currency = await accounting.updateCurrency(currencyCode, currency.id, {
      status,
    })
  }
  return currency
}

export const patchGroupByCode = async (ctx: AuthContext, code: string, attributes: PatchGroupAttributes): Promise<Group> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = await canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to update this group')
  }

  // Prepare update data.
  const { location, image, status, ...rest } = attributes
  const data: GroupUpdateInput = {
    ...rest,
    image: toNullableJsonInput(image),
  }
  let notifyGroupActivated = false

  if (attributes.location !== undefined) {
    const location = fromLocation(attributes.location)
    data.latitude = location.latitude
    data.longitude = location.longitude
  }

  // Status transition
  if (status !== undefined && status !== group.status) {
    if (status === 'active' && group.status === 'disabled'
      || status === 'disabled' && group.status === 'active') {
      // group admins can enable/disable the group.
    } else if (group.status === 'pending' && status === 'active') {
      // Only superadmins can activate a group.
      if (!ctx.isSuperadmin) {
        throw forbidden('Only superadmins can activate groups')
      }
    } else {
      throw badRequest(`Invalid status transition from ${group.status} to ${status}`)
    }

    // Handle side effects of status transitions.
    if (status === 'active' || status === 'disabled') {
      const currency = await syncCurrencyStatus(ctx, group, status)
      if (!group.currencyId) {
        data.currencyId = currency.id
      }
    }

    if (group.status === 'pending' && status === 'active') {
      notifyGroupActivated = true
    }

    data.status = status
  }
  
  const db = tenantDb(prisma, code)
  const dbUpdated = await db.group.update({
    where: { id: group.id },
    data,
    include: {
      admins: true,
    }
  })

  if (attributes.image !== undefined) {
    await syncResourceFiles(code, 'groups', group.id, attributes.image ? [attributes.image.url] : [])
  }

  const updated = toGroup(dbUpdated)

  if (notifyGroupActivated) {
    const notifications = createNotificationsClient(ctx)
    await notifications.notifyGroupActivated(updated)
  }

  return updated
}

export const deleteGroupByCode = async (ctx: AuthContext, code: string): Promise<void> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = await canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to delete this group')
  }

  const accounting = createAccountingClient(ctx)
  await accounting.deleteCurrency(getCurrencyCode(group))

  const db = tenantDb(prisma, code)
  await db.group.update({
    where: { id: group.id },
    data: { deleted: new Date() },
  })

  await syncResourceFiles(code, 'groups', group.id, [])
}

export const patchGroupSettingsByCode = async (
  ctx: AuthContext,
  code: string,
  attributes: PatchGroupSettingsAttributes,
): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const group = await getGroupByCode(ctx, code)

  const allowed = await canWriteGroup(ctx, group)
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
    include: {
      admins: true,
    }
  })

  return toGroup(updated)
}

export const getCurrencyCode = (group: Group): string => {
  return group.code
}
