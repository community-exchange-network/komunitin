import prisma from '../../utils/prisma'
import { Prisma, User as DbUser, type Member as DbMember } from '../../generated/prisma/client'
import type { User, UserSettings, CreateUserInput } from './types'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { privilegedDb } from '../../server/multitenant'
import { AuthContext } from '../../server/context'
import { CollectionParams } from '../../server/request'
import type { DbGroup } from '../groups/service'
import { getMemberInclude, toMember } from '../members/service'
import type { Member } from '../members/types'

const castSettings = (settings: unknown): UserSettings | null => {
  if (!settings || typeof settings !== 'object') {
    return null
  }
  return settings as UserSettings
}

const toUser = (user: DbUser): User => {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    settings: castSettings(user.settings),
    created: user.created,
    updated: user.updated,
  }
}

export const resolveUserId = (ctx: AuthContext, id: string): string => {
  return id === 'me' ? ctx.userId : id
}

const canReadUser = (ctx: AuthContext, id: string): boolean => {
  return ctx.userId === id || ctx.isSuperadmin || ctx.isSocialReadAll
}

const mergeSettings = (current: UserSettings | null, patch: UserSettings): Prisma.InputJsonObject => {
  const merged: UserSettings = {
    ...(current ?? {}),
    ...patch,
  }

  if (patch.notifications) {
    merged.notifications = {
      ...current?.notifications,
      ...patch.notifications,
    }
  }

  if (patch.emails) {
    merged.emails = {
      ...current?.emails,
      ...patch.emails,
    }
  }

  return merged as Prisma.InputJsonObject
}

export const createUser = async ({
  id,
  email,
  name,
  settings,
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
      settings,
    },
    update: {
      email,
      name,
      settings,
    }
  })

  return toUser(user)
}

export const getUserById = async (ctx: AuthContext, id: string): Promise<User> => {
  const userId = resolveUserId(ctx, id)
  if (!canReadUser(ctx, userId)) {
    throw forbidden('You can only access your own user resource')
  }
  const db = privilegedDb(prisma)
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) {
    throw notFound('User not found')
  }

  return toUser(user)
}

export const patchUserSettings = async (
  ctx: AuthContext,
  id: string,
  settings: UserSettings,
): Promise<User> => {
  const userId = resolveUserId(ctx, id)
  if (ctx.userId !== userId) {
    throw forbidden('You can only update your own user settings')
  }

  const current = await getUserById(ctx, userId)
  const db = privilegedDb(prisma)
  const updated = await db.user.update({
    where: { id: userId },
    data: {
      settings: mergeSettings(current.settings, settings),
    },
  })

  return toUser(updated)
}

export const listUserMembers = async (
  ctx: AuthContext,
  id: string,
  params: CollectionParams,
): Promise<Member[]> => {
  const userId = resolveUserId(ctx, id)
  await getUserById(ctx, userId)

  const sortField = params.sort[0]?.field ?? 'created'
  const sortOrder = params.sort[0]?.order ?? 'asc'
  const db = privilegedDb(prisma)
  const relations = await db.memberUser.findMany({
    where: {
      userId,
      member: {
        deleted: null,
      },
    },
    include: {
      member: {
        include: getMemberInclude(params.include),
      },
    },
    orderBy: [
      {
        member: {
          [sortField]: sortOrder,
        },
      },
      { memberId: 'asc' },
    ] as Prisma.MemberUserOrderByWithRelationInput[],
    skip: params.pagination.cursor,
    take: params.pagination.size,
  })

  return relations.map((relation) => toMember(
    relation.member as DbMember & { group?: DbGroup }
  ))
}

/**
 * List users provided a list of member IDs.
 * 
 * This feature is used by the notifications service and we request the read_all scope.
 */
export const listUsers = async (ctx: AuthContext, params: CollectionParams): Promise<User[]> => {
  
  const allowed = ctx.isSuperadmin || ctx.isSocialReadAll
  
  if (!allowed) {
    throw forbidden('You do not have permission to list users')
  }

  if (!params.filters.members) {
    throw badRequest('Filtering by member id(s) is required to list users')
  }

  const memberIds = Array.isArray(params.filters.members)
    ? params.filters.members
    : params.filters.members
      ? [params.filters.members]
      : []

  if (memberIds.length === 0) {
     return []
  }

  const order = params.sort[0]?.order ?? 'asc'

  const db = privilegedDb(prisma)
  const users = await db.user.findMany({
    where: {
      members: {
        some: {
          memberId: {
            in: memberIds,
          },
        },
      },
    },
    orderBy: [
      { created: order },
      { id: 'asc' },
    ],
    skip: params.pagination.cursor,
    take: params.pagination.size
  })

  return users.map(toUser)
}
