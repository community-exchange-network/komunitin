import { InputJsonObject } from '@prisma/client/runtime/client'
import { Group as DbGroup } from '../../generated/prisma/client'
import { privilegedDb, tenantDb } from '../../server/multitenant'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma from '../../utils/prisma'
import type { CollectionParams } from '../../server/request'
import { whereFilter, orderBySort } from '../../server/query'
import { Address, Location, PatchGroupAttributes } from './schema'
import type { CreateGroupInput, Group } from './types'
import { OptionalAuthContext, AuthContext } from '../../server/context'


const toLocation = (group: DbGroup): Location | null => {
  if (group.longitude === null || group.latitude === null) {
    return null
  }
  const address = group.address as Address | null

  return {
    name: address?.addressLocality || address?.addressRegion || address?.addressCountry || undefined,
    type: 'Point',
    coordinates: [group.longitude, group.latitude],
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

      latitude: attributes.location?.coordinates[1],
      longitude: attributes.location?.coordinates[0],
      
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

export const isGroupAdmin = async (ctx: OptionalAuthContext, group: Group): Promise<boolean> => {
  const db = tenantDb(prisma, group.code)
  const relation = await db.groupAdminUser.findFirst({
    where: {
      groupId: group.id,
      userId: ctx.userId,

    }
  })

  return Boolean(relation)
}

export const isGroupMember = async (ctx: OptionalAuthContext, group: Group): Promise<boolean> => {
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

export const canAccessGroup = async (ctx: OptionalAuthContext, group: Group): Promise<boolean> => {
  return ctx.isSuperadmin
    || (group.status === 'active' && group.access === 'public')
    || (group.status === 'active' && group.access === 'group' && await isGroupMember(ctx, group)) 
    || await isGroupAdmin(ctx, group)
}

export const canWriteGroup = async (ctx: AuthContext, group: Group): Promise<boolean> => {
  return ctx.isSuperadmin || await isGroupAdmin(ctx, group)
}

/**
 * Return all groups accessible to the given user.
 */
export const listGroups = async (ctx: OptionalAuthContext, params: CollectionParams): Promise<Group[]> => {
  const db = privilegedDb(prisma)

  const filterWhere = whereFilter(params.filters)

  const groups = await db.group.findMany({
    where: filterWhere,
    orderBy: orderBySort(params.sort),
  })

  const accessibleGroups: Group[] = []
  for (const dbGroup of groups) {
    const group = toGroup(dbGroup)
    const allowed = await canAccessGroup(ctx, group)
    if (allowed) {
      accessibleGroups.push(group)
    }
  }

  return accessibleGroups.slice(params.pagination.cursor, params.pagination.cursor + params.pagination.size)
}

export const getGroupByCode = async (
  ctx: OptionalAuthContext,
  code: string,
): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const dbGroup = await db.group.findFirst()
  if (!dbGroup) {
    throw notFound('Group not found')
  }
  
  const group = toGroup(dbGroup)

  const allowed = await canAccessGroup(ctx, group)
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

    // Activation must call accounting and be retry-safe before local status updates are allowed.
    // TODO
    throw badRequest('Group activation is not implemented yet')
  }

  const updated = await db.group.update({
    where: { id: group.id },
    data: attributes,
  })

  return toGroup(updated)
}
