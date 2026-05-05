import type { User as DbUser } from '../../generated/prisma/client'
import type { UserSettings, UserAttributes } from './schema'

export type { UserSettings } from './schema'

// Input types derived from request schema
export interface CreateUserInput extends UserAttributes {
  id: string
  settings?: UserSettings
}

// Output types derived from Prisma models
export interface User extends DbUser {
  settings: UserSettings | null
}



