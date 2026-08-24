import { z } from 'zod'
import type { Prisma } from '../../generated/prisma/client'
import type { AuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import type { CollectionResult } from '../../server/query'
import { indexById } from '../../server/query'
import { getFilter, hasInclude, type CollectionParams, type ResourceParams } from '../../server/request'
import { forbidden, notFound } from '../../utils/error'
import prisma from '../../utils/prisma'
import { getGroupByCode, isGroupAdmin } from '../groups/service'
import { enrichMembers, toMember } from '../members/service'
import { toUser } from '../users/service'
import { mergeMemberUserSettings, type MemberUserSettings, type MemberUserSettingsPatch } from './settings'
import type { MemberUser } from './types'

const uuidSchema = z.uuid()

const getAuthorization = async (ctx: AuthContext, code: string) => {
  const group = await getGroupByCode(ctx, code)
  return {
    group,
    canReadAll: ctx.isSuperadmin || ctx.canReadAllSocial || isGroupAdmin(ctx, group),
  }
}

const hydrateMemberUsers = async (
  ctx: AuthContext,
  code: string,
  rows: any[],
  params: ResourceParams,
): Promise<MemberUser[]> => {
  const includeMembers = hasInclude(params, 'member')
  const members = includeMembers
    ? await enrichMembers(
        ctx,
        rows.map(({ member }: any) => toMember(member)),
        [(await getGroupByCode(ctx, code))],
      )
    : []
  const membersById = indexById(members)

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    memberId: row.memberId,
    userId: row.userId,
    settings: row.settings as MemberUserSettings,
    member: membersById.get(row.memberId),
    user: row.user ? toUser(row.user) : undefined,
  }))
}

const getLoad = (params: ResourceParams) => ({
  member: hasInclude(params, 'member'),
  user: hasInclude(params, 'user'),
})

export const listMemberUsers = async (
  ctx: AuthContext,
  code: string,
  params: CollectionParams,
): Promise<CollectionResult<MemberUser>> => {
  const { canReadAll } = await getAuthorization(ctx, code)
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
  const [rows, total] = await Promise.all([
    db.memberUser.findMany({
      where,
      include: getLoad(params),
      orderBy: { id: order },
      skip: params.pagination.cursor,
      take: params.pagination.size,
    }),
    db.memberUser.count({ where }),
  ])

  return {
    items: await hydrateMemberUsers(ctx, code, rows, params),
    total,
  }
}

export const getMemberUser = async (
  ctx: AuthContext,
  code: string,
  id: string,
  params: ResourceParams,
): Promise<MemberUser> => {
  const { canReadAll } = await getAuthorization(ctx, code)
  const db = tenantDb(prisma, code)
  const row = await db.memberUser.findUnique({
    where: { id },
    include: getLoad(params),
  })

  if (!row) {
    throw notFound('Member-user relation not found')
  }
  if (!canReadAll && row.userId !== ctx.userId) {
    throw forbidden('You can only access your own member-user relations')
  }

  return (await hydrateMemberUsers(ctx, code, [row], params))[0]
}

export const patchMemberUser = async (
  ctx: AuthContext,
  code: string,
  id: string,
  patch: MemberUserSettingsPatch,
  params: ResourceParams,
): Promise<MemberUser> => {
  const current = await getMemberUser(ctx, code, id, { include: [] })
  const db = tenantDb(prisma, code)
  const row = await db.memberUser.update({
    where: { id },
    data: {
      settings: mergeMemberUserSettings(current.settings, patch),
    },
    include: getLoad(params),
  })

  return (await hydrateMemberUsers(ctx, code, [row], params))[0]
}
