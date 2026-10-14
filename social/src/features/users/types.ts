import type { User as DbUser } from '../../generated/prisma/client'
import type { UserAttributes } from './schema'

// Input types derived from request schema
export interface CreateUserInput extends UserAttributes {
  id: string
}

// Output types derived from Prisma models
export type User = DbUser
