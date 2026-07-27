import type { Group as DbGroup } from '../../generated/prisma/client'
import type { Access, Address, Contact, CreateGroupAttributes, GroupSettings, GroupStatus, Location } from './schema'

// Input types derived from request schema
export interface CreateGroupInput {
  attributes: CreateGroupAttributes
  settings?: GroupSettings
  currency?: unknown
}

export interface GroupAdmin {
  id: string
  role: 'admin'
}

// Output types derived from Prisma models
export interface Group extends DbGroup {
  code: string
  admins: GroupAdmin[]
  status: GroupStatus
  access: Access
  address: Address | null
  location: Location | null
  settings: GroupSettings | null
  contacts: Contact[] | null
  meta: GroupMeta | null
}

export interface SerializableGroup extends Group {
  relationshipMeta: {
    adminCount: number
    memberCount: number
    canListMembers: boolean
  }
}

export type GroupMeta = {
  request?: {
    currency?: unknown
  }
  [key: string]: any
}
