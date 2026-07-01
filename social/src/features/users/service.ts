import prisma from '../../utils/prisma'
import { User as DbUser } from '../../generated/prisma/client'
import type { User, UserSettings, CreateUserInput } from './types'
import { badRequest, forbidden, notFound } from '../../utils/error'
import { privilegedDb } from '../../server/multitenant'
import { AuthContext } from '../../server/context'
import { CollectionParams } from '../../server/request'

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
