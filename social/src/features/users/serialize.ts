import TsJapi from 'ts-japi'
import { config } from '../../config'
import type { SerializerOptions } from '../../server/jsonapi-serialize'
import type { User } from './types'

const { Linker, Serializer } = TsJapi

export const UserSerializer = new Serializer<User>('users', {
  version: null,
  projection: {
    email: 1,
    name: 1,
    language: 1,
    created: 1,
    updated: 1,
  },
  linkers: {
    resource: new Linker((user) => `${config.API_BASE_URL}/users/${user.id}`)
  }
})

export const serializeUser = async (user: User, params?: SerializerOptions<User>) => {
  return UserSerializer.serialize(user, params)
}

export const serializeUsers = async (users: User[], params?: SerializerOptions<User>) => {
  return UserSerializer.serialize(users, params)
}
