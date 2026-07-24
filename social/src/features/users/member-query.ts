import { Prisma } from '../../generated/prisma/client'
import { privilegedDb } from '../../server/multitenant'
import prisma from '../../utils/prisma'

const getUserMembersWhere = (
  userId: string,
  member: Prisma.MemberWhereInput = {},
): Prisma.MemberWhereInput => ({
  ...member,
  deleted: null,
  users: {
    some: {
      userId,
    },
  },
})


/** Query a user's non-deleted members with the requested filters and includes. */
export const findUserMembers = (
  userId: string,
  { where, ...args }: Partial<Prisma.MemberFindManyArgs>,
) => {
  return privilegedDb(prisma).member.findMany({
    ...args,
    where: getUserMembersWhere(userId, where),
  })
}

/** Count a user's non-deleted members matching the requested filters. */
export const countUserMembers = (
  userId: string,
  where?: Prisma.MemberWhereInput,
) => {
  return privilegedDb(prisma).member.count({
    where: getUserMembersWhere(userId, where),
  })
}
