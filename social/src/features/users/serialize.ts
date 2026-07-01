import TsJapi from 'ts-japi'
import { config } from '../../config'
import type { SerializerOptions } from '../../server/jsonapi-serialize'
import type { User, UserSettings } from './types'

const { Linker, Relator, Serializer } = TsJapi
type UserSettingsWithUserId = UserSettings & { userId: string }

const UserSettingsSerializer = new Serializer<UserSettingsWithUserId>('user-settings', {
  version: null,
  projection: {
    language: 1,
    notifications: 1,
    emails: 1,
  },
  linkers: {
    resource: new Linker((settings) => `${config.API_BASE_URL}/users/${settings.userId}/settings`)
  },
  idKey: 'userId',
})

const UserSerializer = new Serializer<User>('users', {
  version: null,
  projection: {
    email: 1,
    name: 1,
    created: 1,
    updated: 1,
  },
  relators: {
    settings: new Relator<User, UserSettingsWithUserId>(async (user) => {
      if (!user.settings) {
        return undefined
      }

      return {
        userId: user.id,
        ...user.settings,
      }
    }, UserSettingsSerializer, { relatedName: 'settings' })
  },
  linkers: {
    resource: new Linker((user) => `${config.API_BASE_URL}/users/${user.id}`)
  }
})

export const serializeUser = async (user: User, params: {include: string[]}) => {
  return UserSerializer.serialize(user, params)
}

export const serializeUsers = async (users: User[], params?: SerializerOptions<User>) => {
  return UserSerializer.serialize(users, params)
}
