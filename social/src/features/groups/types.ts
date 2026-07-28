import type { Group as DbGroup, Prisma } from '../../generated/prisma/client'
import type { Access, Address, Contact, CreateGroupAttributes, GroupSettings, GroupStatus, Location } from './schema'

// Input types derived from request schema
export interface CreateGroupInput {
  attributes: CreateGroupAttributes
  settings?: GroupSettings
}

export interface GroupAdmin {
  id: string
  role: 'admin'
}

export type GroupMeta = {
  request?: {
    currency?: Prisma.JsonObject
  }
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
