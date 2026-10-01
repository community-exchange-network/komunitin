import type { Prisma } from '../../generated/prisma/client'

export type GroupEmailFrequency = 'never' | 'weekly' | 'monthly'

export type MemberUserSettings = {
  notifications: {
    myAccount: boolean
    group: boolean
  }
  emails: {
    myAccount: boolean
    group: GroupEmailFrequency
  }
}

export type MemberUserSettingsPatch = {
  notifications?: Partial<MemberUserSettings['notifications']>
  emails?: Partial<MemberUserSettings['emails']>
}

export const defaultMemberUserSettings = (
  groupEmailFrequency: GroupEmailFrequency = 'monthly',
): MemberUserSettings => ({
  notifications: {
    myAccount: true,
    group: true,
  },
  emails: {
    myAccount: true,
    group: groupEmailFrequency,
  },
})

export const mergeMemberUserSettings = (
  current: MemberUserSettings,
  patch: MemberUserSettingsPatch,
): Prisma.InputJsonObject => ({
  notifications: {
    ...current.notifications,
    ...patch.notifications,
  },
  emails: {
    ...current.emails,
    ...patch.emails,
  },
})
