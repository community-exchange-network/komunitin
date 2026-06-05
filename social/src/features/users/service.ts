import prisma from '../../utils/prisma'
import { User as DbUser } from '../../generated/prisma/client'
import type { User, UserSettings, CreateUserInput } from './types'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { privilegedDb } from '../../server/multitenant'
import { AuthContext } from '../../server/context'
import { CollectionParams } from '../../server/request'
import { reorderByIds } from '../../server/query'

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
  if (ctx.userId !== id && !ctx.isSuperadmin && !ctx.isSocialReadAll) {
    throw forbidden('You can only access your own user resource')
  }
  const db = privilegedDb(prisma)
  const user = await db.user.findUnique({ where: { id } })
  if (!user) {
    throw notFound('User not found')
  }

  return toUser(user)
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
  const links = await db.memberUser.findMany({
    where: {
      memberId: {
        in: memberIds,
      },
    },
    select: {
      userId: true,
    },
    distinct: ['userId'],
    orderBy: {
      user: {
        created: order,
      }
    },
    skip: params.pagination.cursor,
    take: params.pagination.size
  })

  const userIds = links.map((link) => link.userId)
  if (userIds.length === 0) {
    return []
  }

  const users = await db.user.findMany({
    where: {
      id: {
        in: userIds,
      },
    },
  })

  return reorderByIds(users, userIds).map(toUser)
}
