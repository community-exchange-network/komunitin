import type { Group as DbGroup } from '../../generated/prisma/client'
import type { Member } from '../members/types'
import type { Access, CreateGroupAttributes, GroupSettings, Contact, Address, Location } from './schema'

// Input types derived from request schema
export interface CreateGroupInput {
  attributes: CreateGroupAttributes
  settings?: GroupSettings
  currency?: unknown
}

// Output types derived from Prisma models
export interface Group extends DbGroup {
  code: string
  access: Access
  address: Address | null
  location: Location | null
  settings: GroupSettings | null
  contacts: Contact[] | null
  meta: GroupMeta | null
  
}

export type GroupMeta = {
  request?: {
    currency?: unknown
  }
  [key: string]: any
}