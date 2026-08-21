import { createAccountingClient } from '../../clients/accounting'
import { Prisma, type Member as DbMemberRecord } from '../../generated/prisma/client'
import type { AuthContext, OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { type CollectionResult, indexById, reorderByIds } from '../../server/query'
import { hasInclude, type CollectionParams, type ResourceParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma, { toNullableJsonInput } from '../../utils/prisma'
import { syncResourceFiles } from '../files/service'
import { canListGroupMembers, enrichGroups, getCurrencyCode, getGroupByCode, isGroupAdmin, isGroupMember, toLocation } from '../groups/service'
import type { Group } from '../groups/types'
import { findMemberIds } from './sql'
import type { CreateMemberInput, Member, PatchMemberInput, SerializableMember } from './types'
import { createNotificationsClient } from '../../clients/notifications'
import { findPostRelationshipCounts } from '../posts/sql'
import type { PostRelationshipMeta } from '../posts/types'
import { syncAccountStatus } from './accounting'
import { defaultMemberUserSettings } from '../member-users/settings'

const getMemberLoad = (params: ResourceParams) => ({
  group: hasInclude(params, 'group'),
})

export const toMember = (member: DbMemberRecord, group?: Group): Member => {
  return {
    ...member,
    location: toLocation(member),
    group,
  } as Member
}

/** Add post counts and enrich member groups. */
export const enrichMembers = async (
  ctx: OptionalAuthContext,
  members: Member[],
  groups: Group[],
): Promise<SerializableMember[]> => {
  if (members.length === 0) {
    return []
  }

  const includedGroups = groups.filter((group) =>
      members.some((member) => member.group?.id === group.id))

  const [countMaps, serializableGroups] = await Promise.all([
    Promise.all(groups.map(async (group) => {
      const db = tenantDb(prisma, group.code)
      return findPostRelationshipCounts(
        ctx,
        db,
        group,
        'memberId',
        members
          .filter(({ groupId }) => groupId === group.id)
          .map(({ id }) => id),
      )
    })),
    enrichGroups(ctx, includedGroups),
  ])

  const groupsById = indexById(serializableGroups)

  // Combine the counts from all groups into a single map for easy lookup.
  const postCounts = new Map<string, PostRelationshipMeta>(
    countMaps.flatMap((counts) => [...counts.entries()]),
  )

  return members.map((member) => ({
    ...member,
    group: member.group ? groupsById.get(member.groupId)! : undefined,
    relationshipMeta: postCounts.get(member.id)!,
  }))
}

export const enrichMember = async (
  ctx: OptionalAuthContext,
  member: Member,
  group: Group,
): Promise<SerializableMember> => {
  return (await enrichMembers(ctx, [member], [group]))[0]
}

export const getMemberById = async (code: string, id: string, group?: Group): Promise<Member> => {
  const db = tenantDb(prisma, code)
  const member = await db.member.findFirst({
    where: {
      id,
      deleted: null,
    },
  })

  if (!member) {
    throw notFound('Member not found')
  }

  return toMember(member, group)
}

export const isMemberUser = async (ctx: OptionalAuthContext, member: Pick<Member, 'id' | 'tenantId'>): Promise<boolean> => {
  if (!ctx.userId) {
    return false
  }

  const db = tenantDb(prisma, member.tenantId)
  const relation = await db.memberUser.findFirst({
    where: {
      memberId: member.id,
      userId: ctx.userId,
    },
  })

  return Boolean(relation)
}

const canReadMember = async (ctx: OptionalAuthContext, group: Group, member: Member): Promise<boolean> => {
  return ctx.isSuperadmin
    || ctx.canReadAllSocial
    || (group.status === 'active' && member.status === 'active' && member.access === 'public')  
    || (group.status === 'active' && member.status === 'active' && member.access === 'group' && await isGroupMember(ctx, group))
    || await isMemberUser(ctx, member)
    || isGroupAdmin(ctx, group)
}

const canWriteMember = async (ctx: AuthContext, group: Group, member: Member): Promise<boolean> => {
  return ctx.isSuperadmin
    || await isMemberUser(ctx, member)
    || isGroupAdmin(ctx, group)
    
}

const buildMemberCode = (groupCode: string, index: number): string => {
  return `${groupCode}${(index + "") . padStart(4, '0')}`
}

const findFreeMemberCode = async (groupCode: string): Promise<string> => {
  const db = tenantDb(prisma, groupCode)
  const members = await db.member.findMany({
    select: { code: true },
    where: { code: { startsWith: groupCode } },
  })
  const used = new Set(members
    .map(({ code }) => code.substring(groupCode.length))
    .filter((suffix) => /^\d+$/.test(suffix))
    .map(Number))
  let candidate = 0
  while (used.has(candidate)) {
    candidate++
  }

  return buildMemberCode(groupCode, candidate)
}

const getMemberUserIds = async (member: Pick<Member, 'id' | 'tenantId'>): Promise<string[]> => {
  const db = tenantDb(prisma, member.tenantId)
  const relations = await db.memberUser.findMany({
    where: {
      memberId: member.id,
    },
    select: {
      userId: true,
    },
  })

  return [...new Set(relations.map((relation) => relation.userId))]
}

/**
 * Return all members of a group accessible to the given user.
 * 
 * If no status filter is provided, defaults to 'active' members only.
 */
export const listMembers = async (ctx: OptionalAuthContext, code: string, params: CollectionParams): Promise<CollectionResult<SerializableMember>> => {
  const group = await getGroupByCode(ctx, code)

  if (!await canListGroupMembers(ctx, group)) {
    throw forbidden('You do not have permission to list members in this group')
  }
  const db = tenantDb(prisma, code)
  
  const defaultFilters = {
    status: ['active'],
  }

  const result = await findMemberIds(ctx, db, group, {
    ...params,
    filters: {
      ...defaultFilters,
      ...params.filters,
    },
  })
  
  const members = await db.member.findMany({
    where: {
      id: { in: result.ids },
    },
  })

  const load = getMemberLoad(params)
  const includedGroup = load.group ? group : undefined
  const items = reorderByIds(members, result.ids)
    .map((member) => toMember(member, includedGroup))
  return {
    items: await enrichMembers(ctx, items, [group]),
    total: result.total,
  }
}

export const getMember = async (
  ctx: OptionalAuthContext,
  code: string,
  id: string,
  params: ResourceParams = { include: [] },
): Promise<SerializableMember> => {
  const group = await getGroupByCode(ctx, code)
  const load = getMemberLoad(params)
  const includedGroup = load.group ? group : undefined
  const member = await getMemberById(code, id, includedGroup)

  const allowed = await canReadMember(ctx, group, member)
  if (!allowed) {
    throw forbidden('You do not have access to this member')
  }

  return enrichMember(ctx, member, group)
}

export const createMember = async (
  ctx: AuthContext,
  code: string,
  input: CreateMemberInput,
): Promise<SerializableMember> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)

  let memberCode = input.code?.trim()
  if (memberCode) {
    const isAdmin = ctx.isSuperadmin || isGroupAdmin(ctx, group)
    if (!isAdmin) {
      throw badRequest('Only group admins can set member code')
    }
    const codeExists = await db.member.findFirst({ where: { code: memberCode } })
    if (codeExists) {
      throw badRequest('A member with this code already exists')
    }
  } else {
    memberCode = await findFreeMemberCode(code)
  }

  const member = await db.transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        code: memberCode,
        name: input.name,
        type: input.type ?? 'personal',
        status: 'draft',
        access: input.access ?? group.access,
        description: input.description ?? '',
        image: toNullableJsonInput(input.image),
        address: input.address,
        contacts: input.contacts,
        meta: input.meta,
        latitude: input.location?.coordinates[1],
        longitude: input.location?.coordinates[0],
        groupId: group.id,
      },
    })

    await tx.memberUser.create({
      data: {
        tenantId: code,
        memberId: member.id,
        userId: ctx.userId,
        settings: defaultMemberUserSettings(group.settings.defaultGroupEmailFrequency),
      },
    })

    return member
  })

  await syncResourceFiles(code, 'members', member.id, input.image ? [input.image.url] : [])

  return enrichMember(ctx, toMember(member), group)
}

export const patchMember = async (
  ctx: AuthContext,
  code: string,
  id: string,
  input: PatchMemberInput,
): Promise<SerializableMember> => {
  const group = await getGroupByCode(ctx, code)
  const member = await getMemberById(code, id)

  const allowed = await canWriteMember(ctx, group, member)
  if (!allowed) {
    throw forbidden('You do not have permission to update this member')
  }

  const { location, image, ...rest } = input
  const data: Prisma.MemberUpdateInput = {
    ...rest,
    image: toNullableJsonInput(image),
  }
  let notifyMemberRequested = false
  let notifyMemberJoined = false

  // Status transition.
  if (input.status !== undefined && member.status !== input.status) {
    const from = member.status
    const to = input.status
    if (from === 'draft' && to === 'pending'
      || from === 'active' && to === 'disabled'
      || from === 'disabled' && to === 'active'
    ) {
      // Allowed user transition, no additional checks needed.
    } else if (from === 'pending' && to === 'active'
      || from === 'active' && to === 'suspended'
      || from === 'suspended' && to === 'active'
    ) {
      // Allowed admin transition, check if user is admin.
      if (!(ctx.isSuperadmin || isGroupAdmin(ctx, group))) {
        throw forbidden('Only group admins can perform this status transition')
      }
    } else {
      throw badRequest(`Invalid status transition from ${from} to ${to}`)
    }

    // Status transition approved, handle side effects.
    if (from === 'draft' && to === 'pending') {
      notifyMemberRequested = true
    }
    if (from === 'pending' && to === 'active') {
      notifyMemberJoined = true
    }

    if (to === 'active' || to === 'disabled' || to === 'suspended') {
      const currencyCode = getCurrencyCode(group)
      const account = await syncAccountStatus(ctx, {
        accountId: member.accountId,
        code: member.code,
        userIds: await getMemberUserIds(member),
      }, currencyCode, to)
      data.accountId = account.id
      data.accountHref = account.href
    }
    data.status = to
  }

  if (location) {
    data.latitude = location.coordinates[1]
    data.longitude = location.coordinates[0]
  }

  const db = tenantDb(prisma, code)
  const updated = await db.member.update({
    where: {
      id: member.id,
    },
    data,
  })

  if (input.image !== undefined) {
    await syncResourceFiles(code, 'members', member.id, input.image ? [input.image.url] : [])
  }

  if (notifyMemberRequested || notifyMemberJoined) {
    const notifications = createNotificationsClient(ctx)
    if (notifyMemberRequested) {
      await notifications.notifyMemberRequested(code, updated)
    }
    if (notifyMemberJoined) {
      await notifications.notifyMemberJoined(code, updated)
    }
  }

  return enrichMember(ctx, toMember(updated), group)
}

export const deleteMember = async (ctx: AuthContext, code: string, id: string): Promise<void> => {
  const group = await getGroupByCode(ctx, code)
  const member = await getMemberById(code, id)

  const allowed = await canWriteMember(ctx, group, member)
  if (!allowed) {
    throw forbidden('You do not have permission to delete this member')
  }

  const currencyCode = getCurrencyCode(group)
  const accounting = createAccountingClient(ctx)
  const account = member.accountId
    ? await accounting.findAccountById(currencyCode, member.accountId)
    : await accounting.findAccountByCode(currencyCode, member.code)

  if (account && account.status !== 'deleted') {
    if (account.balance !== undefined && account.balance !== 0) {
      throw badRequest('Account balance must be zero to delete account')
    }
    await accounting.deleteAccount(currencyCode, account.id)
  }

  const db = tenantDb(prisma, code)
  await db.member.update({
    where: { id: member.id },
    data: { deleted: new Date() },
  })

  await syncResourceFiles(code, 'members', member.id, [])
}
