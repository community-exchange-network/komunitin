import { z } from 'zod'
import type { MemberUser as DbMemberUser, Prisma } from '../../generated/prisma/client'
import type { AuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { indexById, type CollectionResult, uniqueById } from '../../server/query'
import { getFilter, hasInclude, type CollectionParams, type ResourceParams } from '../../server/request'
import { forbidden, notFound } from '../../utils/error'
import prisma from '../../utils/prisma'
import { getGroupByCode, isGroupAdmin } from '../groups/service'
import type { Group } from '../groups/types'
import { enrichMembers, toMember } from '../members/service'
import type { Member } from '../members/types'
import { toUser } from '../users/service'
import type { User } from '../users/types'
import { mergeMemberUserSettings, type MemberUserSettings, type MemberUserSettingsPatch } from './settings'
import type { EnrichedMemberUser, MemberUser } from './types'

const uuidSchema = z.uuid()

const getAuthorization = async (ctx: AuthContext, code: string) => {
  const group = await getGroupByCode(ctx, code)
  return {
    group,
    canReadAll: ctx.isSuperadmin || ctx.canReadAllSocial || isGroupAdmin(ctx, group),
  }
}

export const toMemberUser = (
  memberUser: DbMemberUser,
  member?: Member,
  user?: User,
): MemberUser => ({
  ...memberUser,
  settings: memberUser.settings as MemberUserSettings,
  member,
  user,
})

export const enrichMemberUsers = async (
  ctx: AuthContext,
  memberUsers: MemberUser[],
  group: Group,
): Promise<EnrichedMemberUser[]> => {
  const includedMembers = uniqueById(
    memberUsers.flatMap(({ member }) => member ? [member] : []),
  )
  const members = await enrichMembers(ctx, includedMembers, [group])
  const membersById = indexById(members)

  return memberUsers.map((memberUser) => ({
    ...memberUser,
    member: memberUser.member ? membersById.get(memberUser.memberId)! : undefined,
  }))
}

export const enrichMemberUser = async (
  ctx: AuthContext,
  memberUser: MemberUser,
  group: Group,
): Promise<EnrichedMemberUser> => {
  return (await enrichMemberUsers(ctx, [memberUser], group))[0]
}

const getLoad = (params: ResourceParams) => ({
  member: hasInclude(params, 'member'),
  user: hasInclude(params, 'user'),
})

const getAuthorizedMemberUser = async (
  ctx: AuthContext,
  code: string,
  id: string,
  params: ResourceParams,
) => {
  const { group, canReadAll } = await getAuthorization(ctx, code)
  const db = tenantDb(prisma, code)
  const load = getLoad(params)
  const row = await db.memberUser.findUnique({
    where: { id },
    include: load,
  })

  if (!row) {
    throw notFound('Member-user relation not found')
  }
  if (!canReadAll && row.userId !== ctx.userId) {
    throw forbidden('You can only access your own member-user relations')
  }

  return {
    group,
    memberUser: toMemberUser(
      row,
      load.member ? toMember(row.member) : undefined,
      load.user ? toUser(row.user) : undefined,
    ),
  }
}

export const listMemberUsers = async (
  ctx: AuthContext,
  code: string,
  params: CollectionParams,
): Promise<CollectionResult<EnrichedMemberUser>> => {
  const { group, canReadAll } = await getAuthorization(ctx, code)
  const userIds = getFilter(params, 'user', uuidSchema)
  const memberIds = getFilter(params, 'member', uuidSchema)

  if (!canReadAll && userIds?.some((id) => id !== ctx.userId)) {
    throw forbidden('You can only access your own member-user relations')
  }

  const where: Prisma.MemberUserWhereInput = {
    ...(!canReadAll ? { userId: ctx.userId } : userIds ? { userId: { in: userIds } } : {}),
    ...(memberIds ? { memberId: { in: memberIds } } : {}),
  }
  const db = tenantDb(prisma, code)

  if (!canReadAll && await db.memberUser.count({ where: { userId: ctx.userId } }) === 0) {
    throw forbidden('You do not have access to member-user relations in this group')
  }

  const order = params.sort[0]?.order ?? 'asc'
  const load = getLoad(params)
  const [rows, total] = await Promise.all([
    db.memberUser.findMany({
      where,
      include: load,
      orderBy: { id: order },
      skip: params.pagination.cursor,
      take: params.pagination.size,
    }),
    db.memberUser.count({ where }),
  ])

  const items = rows.map((row) => toMemberUser(
    row,
    load.member ? toMember(row.member) : undefined,
    load.user ? toUser(row.user) : undefined,
  ))

  return {
    items: await enrichMemberUsers(ctx, items, group),
    total,
  }
}

export const getMemberUser = async (
  ctx: AuthContext,
  code: string,
  id: string,
  params: ResourceParams,
): Promise<EnrichedMemberUser> => {
  const { group, memberUser } = await getAuthorizedMemberUser(ctx, code, id, params)
  return enrichMemberUser(ctx, memberUser, group)
}

export const patchMemberUser = async (
  ctx: AuthContext,
  code: string,
  id: string,
  patch: MemberUserSettingsPatch,
  params: ResourceParams,
): Promise<EnrichedMemberUser> => {
  const { group, memberUser: current } = await getAuthorizedMemberUser(
    ctx,
    code,
    id,
    { include: [] },
  )
  const db = tenantDb(prisma, code)
  const load = getLoad(params)
  const row = await db.memberUser.update({
    where: { id },
    data: {
      settings: mergeMemberUserSettings(current.settings, patch),
    },
    include: load,
  })

  const memberUser = toMemberUser(
    row,
    load.member ? toMember(row.member) : undefined,
    load.user ? toUser(row.user) : undefined,
  )

  return enrichMemberUser(ctx, memberUser, group)
}
