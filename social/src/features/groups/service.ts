import { InputJsonObject } from '@prisma/client/runtime/client'
import { Prisma, Group as DbGroup } from '../../generated/prisma/client'
import { privilegedDb, tenantDb } from '../../server/multitenant'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma from '../../utils/prisma'
import type { CollectionParams } from '../../server/request'
import { whereFilter, orderBySort } from '../../server/query'
import { Address, Location, PatchGroupAttributes, PatchGroupSettingsAttributes } from './schema'
import type { CreateGroupInput, Group } from './types'
import { OptionalAuthContext, AuthContext } from '../../server/context'
import { listMembers } from '../members/service'
import { GroupUpdateInput } from '../../generated/prisma/models'

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

export const fromLocation = (location?: Location | null): { latitude: number|null; longitude: number|null } => {
  return {
    latitude: location?.coordinates[1] ?? null,
    longitude: location?.coordinates[0] ?? null,
  }
}

/**
 * Map database model to Group type, ready to be serialized and sent in API responses.
 */
const toGroup = (group: DbGroup): Group => {
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
  const location = fromLocation(input.attributes.location)

  const group = await db.transaction(async (tx) => {
    const attributes = input.attributes
    const createData =  {
      tenantId: attributes.code,
      status: 'pending',

      name: attributes.name,
      description: attributes.description ?? '',
      access: attributes.access ?? 'public',
      image: attributes.image,
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

const buildReadableGroupWhere = (ctx: OptionalAuthContext): Prisma.GroupWhereInput => {
  // Superadmins can access all groups
  if (ctx.isSuperadmin) {
    return {}
  }

  // public active groups are accessible to everyone.
  const visibilityWhere: Prisma.GroupWhereInput[] = [{
    status: 'active',
    access: 'public',
  }]

  if (!ctx.userId) {
    return visibilityWhere[0]
  }

  // groups are always accessible to group members
  visibilityWhere.push({
    members: {
      some: {
        deleted: null,
        users: {
          some: {
            userId: ctx.userId,
          },
        },
      },
    },
  })
  // groups where the user is an admin
  visibilityWhere.push({
    admins: {
      some: {
        userId: ctx.userId,
      },
    },
  })

  return { OR: visibilityWhere }
}

/**
 * Return all groups accessible to the given user.
 */
export const listGroups = async (ctx: OptionalAuthContext, params: CollectionParams): Promise<Group[]> => {
  const db = privilegedDb(prisma)

  const { code, ...filters} = params.filters
  if (code) {
    filters.tenantId = code
  }
  const filterWhere = whereFilter(filters)

  const groups = await db.group.findMany({
    where: {
      AND: [filterWhere, buildReadableGroupWhere(ctx)],
    },
    orderBy: orderBySort(params.sort),
    skip: params.pagination.cursor,
    take: params.pagination.size,
  })

  return groups.map(toGroup)
}

export const getGroupByCode = async (
  ctx: OptionalAuthContext,
  code: string,
  options?: {
    includeMembers?: boolean
  },
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

  if (options?.includeMembers) {
    const members = await listMembers(ctx, code)
    return {
      ...group,
      members,
    }
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

    // Activation must call accounting and be retry-safe before local status updates are allowed.
    // TODO
    throw badRequest('Group activation is not implemented yet')
  }

  const { location, ...rest } = attributes
  const data: GroupUpdateInput = rest

  if (attributes.location !== undefined) {
    const location = fromLocation(attributes.location)
    data.latitude = location.latitude
    data.longitude = location.longitude
  }

  const updated = await db.group.update({
    where: { id: group.id },
    data,
  })

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
