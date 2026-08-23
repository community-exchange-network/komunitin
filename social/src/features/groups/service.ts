import { InputJsonObject } from '@prisma/client/runtime/client'
import { Group as DbGroupRaw, GroupAdminUser, Prisma } from '../../generated/prisma/client'
import { GroupUpdateInput } from '../../generated/prisma/models'
import { AuthContext, OptionalAuthContext } from '../../server/context'
import { createAccountingClient } from '../../clients/accounting'
import type { Account, Currency } from '../../clients/accounting'
import { privilegedDb, tenantDb } from '../../server/multitenant'
import { type CollectionResult, reorderByIds } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, internalError, notFound } from '../../utils/error'
import prisma, { toNullableJsonInput } from '../../utils/prisma'
import { syncResourceFiles } from '../files/service'
import type { MemberStatus } from '../members/schema'
import { Address, Location, PatchGroupAttributes, PatchGroupSettingsAttributes } from './schema'
import { findGroupIds } from './sql'
import type { CreateGroupInput, Group, GroupMeta, SerializableGroup } from './types'
import { createNotificationsClient } from '../../clients/notifications'
import { findUserMembers } from '../users/member-query'
import { syncAccountStatus } from '../members/accounting'

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

/** Add viewer-specific relationship metadata required by the group serializer. */
export const enrichGroups = async (
  ctx: OptionalAuthContext,
  groups: Group[],
): Promise<SerializableGroup[]> => {
  if (groups.length === 0) {
    return []
  }

  const db = privilegedDb(prisma)
  const groupIds = groups.map(({ id }) => id)

  const memberCounts = await db.member.groupBy({
    by: ['groupId'],
    where: {
      groupId: { in: groupIds },
      status: 'active',
      deleted: null,
    },
    _count: true,
  })
  const counts = new Map(memberCounts.map(({ groupId, _count }) => [groupId, _count]))

  // get groups where the user is a member, to determine if they can list members
  let userMemberGroups: Set<string> | undefined = undefined
  const getUserMemberGroups = async () => {
    if (userMemberGroups === undefined) {
      const groups = ctx.userId ? await findUserMembers(ctx.userId, {
        where: {
          groupId: { in: groupIds },
          status: 'active',
        },
        select: { groupId: true },
      }) : []
      userMemberGroups = new Set(groups.map(({ groupId }) => groupId))
    }
    return userMemberGroups
  }

  const isMember = (group: Group) => async () => {
    const userMemberGroups = await getUserMemberGroups()
    return userMemberGroups.has(group.id)
  }

  return Promise.all(groups.map(async (group) => ({
    ...group,
    relationshipMeta: {
      adminCount: group.admins.length,
      memberCount: counts.get(group.id) ?? 0,
      canListMembers: await canListGroupMembers(ctx, group, isMember(group)),
    },
  })))
}

export const enrichGroup = async (
  ctx: OptionalAuthContext,
  group: Group,
): Promise<SerializableGroup> => {
  return (await enrichGroups(ctx, [group]))[0]
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
/** Map a database group to the core domain type. */
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
export const createGroup = async (ctx: AuthContext, input: CreateGroupInput): Promise<SerializableGroup> => {
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
    
    settings: input.settings ?? {},
    meta: toNullableJsonInput(attributes.meta as GroupMeta),
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

  return enrichGroup(ctx, group)
}

export const isGroupAdmin = (
  ctx: OptionalAuthContext,
  group: Pick<Group, 'admins'>,
): boolean => Boolean(ctx.userId && group.admins.some(({ id }) => id === ctx.userId))

/**
 * Check if the given context is a member of the group.
 *
 * @param statuses Optional list of member statuses to check for.
 * If not provided, defaults to 'active' members only.
 * If null, will check for any member regardless of status.
 */
export const isGroupMember = async (
  ctx: OptionalAuthContext,
  group: Pick<Group, 'id'>,
  statuses: MemberStatus[] | null = ['active'],
): Promise<boolean> => {
  if (!ctx.userId) {
    return false
  }

  const members = await findUserMembers(ctx.userId, {
    where: {
      groupId: group.id,
      ...(statuses ? { status: { in: statuses } } : {}),
    },
    take: 1,
  })

  return members.length > 0
}

/**
 * Return true if the given context has permission to list members of the group.
 *
 * The optional `isMember` callback lets callers reuse or customize the membership check.
 */
export const canListGroupMembers = async (
  ctx: OptionalAuthContext,
  group: Group,
  isMember = () => isGroupMember(ctx, group, null),
) => {
  return ctx.isSuperadmin || ctx.canReadAllSocial
    || (group.status === 'active' && group.access === 'public' && group.settings?.allowAnonymousMemberList === true)
    || isGroupAdmin(ctx, group)
    || await isMember()
}

export const canReadGroup = async (ctx: OptionalAuthContext, group: Group): Promise<boolean> => {
  return ctx.isSuperadmin
    || ctx.canReadAllSocial
    || (group.status === 'active' && group.access === 'public')
    || isGroupAdmin(ctx, group)
    || await isGroupMember(ctx, group, null)
}

export const canWriteGroup = (ctx: AuthContext, group: Group): boolean => {
  return ctx.isSuperadmin || isGroupAdmin(ctx, group)
}

/**
 * Return all groups accessible to the given user.
 * 
 * If no status filter is provided, defaults to 'active' groups only.
 */
export const listGroups = async (ctx: OptionalAuthContext, params: CollectionParams): Promise<CollectionResult<SerializableGroup>> => {
  const db = privilegedDb(prisma)

  const defaultFilters = {
    status: ['active']
  }
  
  const result = await findGroupIds(ctx, db, {
    ...params,
    filters: {
      ...defaultFilters,
      ...params.filters,
    }
  })

  const groups = await db.group.findMany({
    where: {
      id: { in: result.ids },
    },
    include: {
      admins: true
    },
  })

  const items = reorderByIds(groups, result.ids).map(toGroup)
  return {
    items: await enrichGroups(ctx, items),
    total: result.total,
  }
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

const syncCurrencyStatus = async (ctx: AuthContext, group: Group, status: Currency["status"], attributes?: Record<string, unknown>): Promise<Currency> => {
  const accounting = createAccountingClient(ctx)
  const currencyCode = getCurrencyCode(group)
  let currency = await accounting.findCurrencyByCode(currencyCode)
  if (!currency) {
    // Create currency
    const adminUserIds = group.admins.map((admin) => admin.id)
    
    currency = await accounting.createCurrency({
      ...attributes,
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

type AdminMemberCandidate = {
  accountId?: string | null
  adminUserId: string
  code: string
  memberId?: string
}

type AdminMemberProvision = AdminMemberCandidate & {
  account: Account
}

const getAdminMemberCandidate = async (group: Group): Promise<AdminMemberCandidate> => {
  const adminUserId = group.admins[0].id
  const code = `${group.code}0000`
  const db = tenantDb(prisma, group.code)
  const member = await db.member.findFirst({
    where: { code },
    include: { users: true },
  })

  if (member && (
    member.deleted
    || !member.users.some(({ userId }) => userId === adminUserId)
  )) {
    throw badRequest(`Reserved administrator member ${code} is already in use`)
  }

  return {
    adminUserId,
    accountId: member?.accountId,
    code,
    memberId: member?.id,
  }
}

export const patchGroupByCode = async (ctx: AuthContext, code: string, attributes: PatchGroupAttributes): Promise<SerializableGroup> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to update this group')
  }

  // Prepare update data.
  const { location, image, status, meta, ...rest } = attributes
  const data: GroupUpdateInput = {
    ...rest,
    image: toNullableJsonInput(image),
  }
  const groupName = attributes.name ?? group.name
  const groupAccess = attributes.access ?? group.access

  if (meta !== undefined) {
    if (group.status !== 'pending') {
      throw badRequest('Currency request can only be changed for pending groups')
    }
    data.meta = toNullableJsonInput(meta as GroupMeta)
  }

  if (attributes.location !== undefined) {
    const location = fromLocation(attributes.location)
    data.latitude = location.latitude
    data.longitude = location.longitude
  }

  // Status transition
  let adminMemberCandidate: AdminMemberCandidate | undefined
  let adminMemberProvision: AdminMemberProvision | undefined

  if (status !== undefined && status !== group.status) {
    if (status === 'active' && group.status === 'disabled'
      || status === 'disabled' && group.status === 'active') {
      // group admins can enable/disable the group.
    } else if (group.status === 'pending' && status === 'active') {
      // Only superadmins can activate a group.
      if (!ctx.isSuperadmin) {
        throw forbidden('Only superadmins can activate groups')
      }
      adminMemberCandidate = await getAdminMemberCandidate(group)
    } else {
      throw badRequest(`Invalid status transition from ${group.status} to ${status}`)
    }

    // Handle side effects of status transitions.
    if (status === 'active' || status === 'disabled') {
      const currencyAttributes = (meta ?? group.meta)?.request?.currency
      const currency = await syncCurrencyStatus(ctx, group, status, currencyAttributes)
      data.currencyId = currency.id
      data.currencyHref = currency.href
    }

    // If the group is being activated
    if (adminMemberCandidate) {
      const account = await syncAccountStatus(ctx, {
        accountId: adminMemberCandidate.accountId,
        code: adminMemberCandidate.code,
        userIds: [adminMemberCandidate.adminUserId],
      }, getCurrencyCode(group), 'active')
      adminMemberProvision = {
        ...adminMemberCandidate,
        account,
      }
      // Clear the meta field on activation.
      data.meta = Prisma.DbNull
    }

    data.status = status
  }
  
  const db = tenantDb(prisma, code)
  const dbUpdated = await db.transaction(async (tx) => {
    const updatedGroup = await tx.group.update({
      where: { id: group.id },
      data,
      include: {
        admins: true,
      },
    })

    if (adminMemberProvision) {
      const memberData = {
        name: groupName,
        status: 'active',
        access: groupAccess,
        accountId: adminMemberProvision.account.id,
        accountHref: adminMemberProvision.account.href,
        address: updatedGroup.address as Prisma.InputJsonObject,
        latitude: updatedGroup.latitude,
        longitude: updatedGroup.longitude,
      }
      const member = adminMemberProvision.memberId
        ? await tx.member.update({
            where: { id: adminMemberProvision.memberId },
            data: memberData,
          })
        : await tx.member.create({
            data: {
              ...memberData,
              code: adminMemberProvision.code,
              type: 'public',
              description: '',
              contacts: [],
              groupId: group.id,
            },
          })

      await tx.memberUser.upsert({
        where: {
          memberId_userId: {
            memberId: member.id,
            userId: adminMemberProvision.adminUserId,
          },
        },
        create: {
          tenantId: code,
          memberId: member.id,
          userId: adminMemberProvision.adminUserId,
          role: 'admin',
        },
        update: {
          role: 'admin',
        },
      })
    }

    return updatedGroup
  })

  if (attributes.image !== undefined) {
    await syncResourceFiles(code, 'groups', group.id, attributes.image ? [attributes.image.url] : [])
  }

  const updated = await enrichGroup(ctx, toGroup(dbUpdated))

  if (adminMemberCandidate) {
    const notifications = createNotificationsClient(ctx)
    await notifications.notifyGroupActivated(updated)
  }

  return updated
}

export const deleteGroupByCode = async (ctx: AuthContext, code: string): Promise<void> => {
  const group = await getGroupByCode(ctx, code)

  const allowed = canWriteGroup(ctx, group)
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

  const allowed = canWriteGroup(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to update this group')
  }

  const currentSettings = group.settings as Prisma.JsonObject
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
