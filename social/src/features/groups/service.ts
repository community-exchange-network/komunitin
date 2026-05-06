import { InputJsonObject } from '@prisma/client/runtime/client'
import { Group as DbGroup } from '../../generated/prisma/client'
import { privilegedDb, tenantDb } from '../../server/multitenant'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma from '../../utils/prisma'
import { Address, Location, PatchGroupAttributes } from './schema'
import type { CreateGroupInput, Group } from './types'


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
export const createGroup = async (input: CreateGroupInput, authUserId: string): Promise<Group> => {
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
        userId: authUserId,
        role: 'admin',
      }
    })

    return created
  })

  return toGroup(group)
}

const isGroupAdmin = async (code: string, groupId: string, userId: string): Promise<boolean> => {
  const db = tenantDb(prisma, code)
  const relation = await db.groupAdminUser.findFirst({
    where: {
      groupId,
      userId,
    }
  })

  return Boolean(relation)
}

const isGroupMember = async (code: string, userId: string): Promise<boolean> => {
  const db = tenantDb(prisma, code)
  const relation = await db.memberUser.findFirst({
    where: {
      userId,
      member: {
        deleted: null,
      },
    }
  })

  return Boolean(relation)
}

const canAccessGroup = async (group: Group, userId?: string, isSuperAdmin = false): Promise<boolean> => {
  const isAdmin = async () => userId ? await isGroupAdmin(group.code, group.id, userId) : false
  const isMember = async() => userId ? await isGroupMember(group.code, userId) : false

  return isSuperAdmin
    || (group.status === 'active' && group.access === 'public')
    || (group.status === 'active' && group.access === 'group' && await isMember()) 
    || await isAdmin()
}

/**
 * Return all groups accessible to the given user.
 */
export const listGroups = async (authUserId?: string, isSuperadmin = false): Promise<Group[]> => {
  const db = privilegedDb(prisma)
  const groups = await db.group.findMany({
    orderBy: {
      created: 'desc'
    }
  })

  const accessibleGroups: Group[] = []
  for (const group of groups) {
    const allowed = await canAccessGroup(toGroup(group), authUserId, isSuperadmin)
    if (allowed) {
      accessibleGroups.push(toGroup(group))
    }
  }

  return accessibleGroups 
}

export const getGroupByCode = async (
  code: string,
  authUserId?: string,
  callerIsSuperadmin = false,
): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const group = await db.group.findFirst()
  if (!group) {
    throw notFound('Group not found')
  }

  const allowed = await canAccessGroup(group as Group, authUserId, callerIsSuperadmin)
  if (!allowed) {
    throw forbidden('You do not have access to this group')
  }

  return toGroup(group)
}

export const patchGroupByCode = async (code: string, attributes: PatchGroupAttributes, authUserId: string, isSuperadmin = false): Promise<Group> => {
  const db = tenantDb(prisma, code)
  const group = await db.group.findFirst()

  if (!group) {
    throw notFound('Group not found')
  }

  const isAdmin = await isGroupAdmin(code, group.id, authUserId)
  if (!isAdmin && !isSuperadmin) {
    throw forbidden('Only group admins can update this group')
  }

  if (typeof attributes.status === 'string') {
    if (!isSuperadmin || attributes.status !== 'active' || group.status !== 'pending') {
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
