import prisma from '../../utils/prisma'
import { Prisma } from '../../generated/prisma/client'
import type { User, UserSettings, CreateUserInput } from './types'
import { badRequest, notFound } from '../../utils/error'

const castSettings = (settings: unknown): UserSettings | null => {
  if (!settings || typeof settings !== 'object') {
    return null
  }
  return settings as UserSettings
}

const toUser = (user: Prisma.UserModel): User => {
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

  const user = await prisma.user.upsert({
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

export const getUserById = async (id: string): Promise<User> => {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) {
    throw notFound('User not found')
  }

  return toUser(user)
}
