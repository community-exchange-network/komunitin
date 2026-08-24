import prisma from '../../utils/prisma'
import { Prisma, User as DbUser, type Member as DbMember } from '../../generated/prisma/client'
import type { User, CreateUserInput } from './types'
import { badRequest, forbidden, internalError, notFound } from '../../utils/error'
import { privilegedDb } from '../../server/multitenant'
import { AuthContext } from '../../server/context'
import { hasInclude, type CollectionParams } from '../../server/request'
import { type CollectionResult, indexById, uniqueById } from '../../server/query'
import { type DbGroup, getGroupByCode, isGroupAdmin, toGroup } from '../groups/service'
import { enrichMembers, toMember } from '../members/service'
import type { SerializableMember } from '../members/types'
import { countUserMembers, findUserMembers } from './member-query'
import type { MemberUserSettings } from '../member-users/settings'
import { mergeMemberUserSettings } from '../member-users/settings'

export const toUser = (user: DbUser): User => user

export const listGroupAdmins = async (
  ctx: AuthContext,
  code: string,
  params: CollectionParams,
): Promise<CollectionResult<User>> => {
  const group = await getGroupByCode(ctx, code)
  const allowed = ctx.isSuperadmin || ctx.canReadAllSocial || isGroupAdmin(ctx, group)
  if (!allowed) {
    throw forbidden('You do not have permission to list group administrators')
  }

  const db = privilegedDb(prisma)
  const order = params.sort[0]?.order ?? 'asc'
  const relations = await db.groupAdminUser.findMany({
    where: {
      tenantId: code,
      groupId: group.id,
    },
    include: { user: true },
    orderBy: [
      { user: { created: order } },
      { userId: 'asc' },
    ],
    skip: params.pagination.cursor,
    take: params.pagination.size,
  })

  return {
    items: relations.map(({ user }) => toUser(user)),
    total: group.admins.length,
  }
}

const canReadUser = (ctx: AuthContext, id: string): boolean => {
  return ctx.userId === id || ctx.isSuperadmin || ctx.canReadAllSocial
}

export const createUser = async ({
  id,
  email,
  name,
  language,
}: CreateUserInput): Promise<User> => {
  if (!email) {
    throw badRequest('User email is required in attributes')
  }

  const db = privilegedDb(prisma)

  const user = await db.user.upsert({
    where: { id },
    create: {
      id,
      email,
      name,
      language,
    },
    update: {
      email,
      name,
      language,
    }
  })

  return toUser(user)
}

export const getUserById = async (ctx: AuthContext, id: string): Promise<User> => {
  if (!canReadUser(ctx, id)) {
    throw forbidden('You can only access your own user resource')
  }
  const db = privilegedDb(prisma)
  const user = await db.user.findUnique({ where: { id } })
  if (!user) {
    throw notFound('User not found')
  }

  return toUser(user)
}

export const patchUser = async (
  ctx: AuthContext,
  id: string,
  language: string | null,
): Promise<User> => {
  if (ctx.userId !== id) {
    throw forbidden('You can only update your own user resource')
  }

  await getUserById(ctx, id)
  const db = privilegedDb(prisma)
  const updated = await db.user.update({
    where: { id },
    data: { language },
  })

  return toUser(updated)
}

/**
 * Updates all related member-users to set the email group 
 * notifications to "never".
 */
export const unsubscribeUser = async (id: string): Promise<void> => {
  const db = privilegedDb(prisma)

  try {
    await db.transaction(async (tx) => {
      const relations = await tx.memberUser.findMany({ where: { userId: id } })
      await Promise.all(relations.map((relation) => tx.memberUser.update({
        where: { id: relation.id },
        data: {
          settings: mergeMemberUserSettings(relation.settings as MemberUserSettings, {
            emails: { group: 'never' },
          }),
        },
      })))
    })
  } catch (cause) {
    throw internalError(`Failed to unsubscribe user ${id}`, { cause })
  }
}

export const listUserMembers = async (
  ctx: AuthContext,
  id: string,
  params: CollectionParams,
): Promise<CollectionResult<SerializableMember>> => {
  await getUserById(ctx, id)

  const sortField = params.sort[0]?.field ?? 'created'
  const sortOrder = params.sort[0]?.order ?? 'asc'
  const [members, total] = await Promise.all([
    findUserMembers(id, {
      include: {
        group: {
          include: { admins: true },
        },
      },
      orderBy: [
        { [sortField]: sortOrder },
        { id: 'asc' },
      ],
      skip: params.pagination.cursor,
      take: params.pagination.size,
    }),
    countUserMembers(id),
  ])

  const membersWithGroups = members as (DbMember & { group: DbGroup })[]
  const groups = uniqueById(membersWithGroups.map(({ group }) => toGroup(group)))
  const groupsById = indexById(groups)
  const includeGroups = hasInclude(params, 'group')
  const items = membersWithGroups.map((member) =>
    toMember(member, includeGroups ? groupsById.get(member.groupId)! : undefined)
  )

  return {
    items: await enrichMembers(ctx, items, groups),
    total,
  }
}

/**
 * List users provided a list of member IDs.
 * 
 * This feature is used by the notifications service with its social:read service token.
 */
export const listUsers = async (ctx: AuthContext, params: CollectionParams): Promise<CollectionResult<User>> => {
  
  const allowed = ctx.isSuperadmin || ctx.canReadAllSocial
  
  if (!allowed) {
    throw forbidden('You do not have permission to list users')
  }

  if (!params.filters.members) {
    throw badRequest('Filtering by member id(s) is required to list users')
  }

  const memberIds = params.filters.members

  if (memberIds.length === 0) {
     return { items: [], total: 0 }
  }

  const order = params.sort[0]?.order ?? 'asc'

  const db = privilegedDb(prisma)
  const where: Prisma.UserWhereInput = {
    members: {
      some: {
        memberId: {
          in: memberIds,
        },
      },
    },
  }
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: [
        { created: order },
        { id: 'asc' },
      ],
      skip: params.pagination.cursor,
      take: params.pagination.size
    }),
    db.user.count({ where }),
  ])

  return { items: users.map(toUser), total }
}
