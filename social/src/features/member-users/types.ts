import type { MemberUser as DbMemberUser } from '../../generated/prisma/client'
import type { Member, SerializableMember } from '../members/types'
import type { User } from '../users/types'
import type { MemberUserSettings } from './settings'

export type MemberUser = Omit<DbMemberUser, 'settings'> & {
  settings: MemberUserSettings
  member?: Member
  user?: User
}

export type EnrichedMemberUser = Omit<MemberUser, 'member'> & {
  member?: SerializableMember
}

export type SerializableMemberUser = Omit<EnrichedMemberUser, 'settings'> & MemberUserSettings
