import type { MemberUser as DbMemberUser } from '../../generated/prisma/client'
import type { SerializableMember } from '../members/types'
import type { User } from '../users/types'
import type { MemberUserSettings } from './settings'

export type MemberUser = Omit<DbMemberUser, 'settings'> & {
  settings: MemberUserSettings
  member?: SerializableMember
  user?: User
}

export type SerializableMemberUser = Omit<MemberUser, 'settings'> & MemberUserSettings
