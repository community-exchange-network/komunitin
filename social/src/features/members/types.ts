import type { Member as DbMember } from '../../generated/prisma/client'
import type { PostRelationshipMeta } from '../posts/types'
import type { Access } from '../groups/schema'
import type {
  Address,
  Contact,
  CreateMemberAttributes,
  Location,
  MemberMeta,
  MemberStatus,
  MemberType,
  PatchMemberAttributes,
} from './schema'
import type { Group, SerializableGroup } from '../groups/types'

// Input types derived from request schema
export type CreateMemberInput = CreateMemberAttributes
export type PatchMemberInput = PatchMemberAttributes

// Output types derived from Prisma models
export interface Member extends DbMember {
  access: Access
  type: MemberType
  status: MemberStatus
  image: Image | null
  address: Address | null
  location: Location | null
  contacts: Contact[] | null
  meta: MemberMeta
  // Group is optionally included based on request parameters.
  group?: Group
}

export interface SerializableMember extends Member {
  group?: SerializableGroup
  relationshipMeta: PostRelationshipMeta
}

export type Image = {
  url: string
  alt?: string
}
