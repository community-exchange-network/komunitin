import { Account, createAccountingClient } from '../../clients/accounting'
import { Prisma, type Member as DbMemberRecord } from '../../generated/prisma/client'
import type { AuthContext, OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { type CollectionResult, reorderByIds } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma, { toNullableJsonInput } from '../../utils/prisma'
import { syncResourceFiles } from '../files/service'
import { DbGroup, enrichGroups, getCurrencyCode, getGroupByCode, isGroupAdmin, isGroupMember, toGroup, toLocation } from '../groups/service'
import type { Group } from '../groups/types'
import { findMemberIds } from './sql'
import type { CreateMemberInput, Member, PatchMemberInput, SerializableMember } from './types'
import { createNotificationsClient } from '../../clients/notifications'
import { findPostRelationshipCounts } from '../posts/sql'
import type { PostRelationshipMeta } from '../posts/types'

export type DbMember = DbMemberRecord & { group: DbGroup }

export const toMember = (member: DbMember): Member => {
  return {
    ...member,
    location: toLocation(member),
    group: toGroup(member.group),
  } as Member
}

export const getMemberInclude = () => ({
  group: {
    include: {
      admins: true,
    },
  },
} as const)

/** Add post counts and enrich member groups. */
export const enrichMembers = async (
  ctx: OptionalAuthContext,
  members: Member[],
): Promise<SerializableMember[]> => {
  if (members.length === 0) {
    return []
  }

  const groups = members.map(({ group }) => group)
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
    enrichGroups(ctx, groups),
  ])

  const groupsById = new Map(serializableGroups.map((group) => [group.id, group]))
  
  // Combine the counts from all groups into a single map for easy lookup.
  const postCounts = new Map<string, PostRelationshipMeta>(
    countMaps.flatMap((counts) => [...counts.entries()]),
  )

  return members.map((member) => ({
    ...member,
    group: groupsById.get(member.groupId)!,
    relationshipMeta: postCounts.get(member.id)!,
  }))
}

export const enrichMember = async (
  ctx: OptionalAuthContext,
  member: Member,
): Promise<SerializableMember> => {
  return (await enrichMembers(ctx, [member]))[0]
}

const getMemberById = async (code: string, id: string): Promise<Member> => {
  const db = tenantDb(prisma, code)
  const member = await db.member.findFirst({
    where: {
      id,
      deleted: null,
    },
    include: getMemberInclude(),
  })

  if (!member) {
    throw notFound('Member not found')
  }

  return toMember(member)
}

export const isMemberUser = async (ctx: OptionalAuthContext, member: Pick<Member, 'id' | 'tenantId'>, role?: 'admin' ): Promise<boolean> => {
  if (!ctx.userId) {
    return false
  }

  const db = tenantDb(prisma, member.tenantId)
  const relation = await db.memberUser.findFirst({
    where: {
      memberId: member.id,
      userId: ctx.userId,
      ...(role ? { role } : {}),
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
    || await isMemberUser(ctx, member, "admin")  
    || isGroupAdmin(ctx, group)
    
}

const buildMemberCode = (groupCode: string, index: number): string => {
  return `${groupCode}${(index + "") . padStart(4, '0')}`
}

const findFreeMemberCode = async (groupCode: string): Promise<string> => {
  const db = tenantDb(prisma, groupCode)
  // Get all existing codes from the DB.
  const members = await db.member.findMany({
    select: {
      code: true,
    },
    where: {
      code: { startsWith: groupCode },
    }
  })
  const existingCodes = members.map(m => m.code.substring(groupCode.length))
    .filter(code => /^\d+$/.test(code)) // Only consider numeric codes
    .map(code => parseInt(code))
    .sort((a, b) => a - b)
  
  // Find the first gap in the sequence of existing codes.
  const candidate = existingCodes.length > 0 ? existingCodes[0] + 1 : 0
  let index = 1
  while (index < existingCodes.length && existingCodes[index] === candidate) {
    index++
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

type AccountingClient = ReturnType<typeof createAccountingClient>

const findMemberAccount = async (accounting: AccountingClient, member: Member, currencyCode: string): Promise<Account | undefined> => {
  if (member.accountId) {
    return await accounting.getAccount(currencyCode, member.accountId)
  }

  // Just in case the member has an account but the accountId is not set, 
  // try to find it by code before creating a new one.
  return await accounting.findAccountByCode(currencyCode, member.code)
}

/**
 * Synchronize the account status from the accounting service to the provided status.
 * 
 * If the member does not have an account, one will be created. If the account exists 
 * but has a different status, it will be updated.
 */
const syncAccountStatus = async (ctx: AuthContext, member: Member, currencyCode: string, status: Account["status"]): Promise<Account> => {
  const accounting = createAccountingClient(ctx)
  let account = await findMemberAccount(accounting, member, currencyCode)

  if (!account) {
    const users = await getMemberUserIds(member)
    account = await accounting.createAccount(currencyCode, {
      code: member.code,
    }, users)
  }

  // Update account status if needed.
  if (account.status !== status) {
    account = await accounting.updateAccount(currencyCode, account.id, { status })
  }

  return account
}

/**
 * Return true if the given context has permission to list members of the group.
 * 
 * The optional `isMember` checks if the user is a member of the group. This can be 
 * used to avoid unnecessary database queries.
 */
export const canListGroupMembers = async (
  ctx: OptionalAuthContext,
  group: Group,
  isMember = () => isGroupMember(ctx, group),
) => {
  return ctx.isSuperadmin || ctx.canReadAllSocial
    || (group.status === 'active' && group.access === 'public' && group.settings?.allowAnonymousMemberList === true)
    || isGroupAdmin(ctx, group)
    || await isMember()
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
    include: getMemberInclude(),
  })

  const items = reorderByIds(members, result.ids).map(toMember)
  return {
    items: await enrichMembers(ctx, items),
    total: result.total,
  }
}

export const getMember = async (ctx: OptionalAuthContext, code: string, id: string): Promise<SerializableMember> => {
  const group = await getGroupByCode(ctx, code)
  const member = await getMemberById(code, id)

  const allowed = await canReadMember(ctx, group, member)
  if (!allowed) {
    throw forbidden('You do not have access to this member')
  }

  return enrichMember(ctx, member)
}

export const createMember = async (ctx: AuthContext, code: string, input: CreateMemberInput): Promise<SerializableMember> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)

  let memberCode = input.code?.trim()
  if (memberCode) {
    const isAdmin = ctx.isSuperadmin || isGroupAdmin(ctx, group)
    if (!isAdmin) {
      throw badRequest('Only group admins can set member code')
    }
    const codeExists = await db.member.findFirst({
      where: {
        code: memberCode,
      },
    })
    if (codeExists) {
      throw badRequest('A member with this code already exists')
    }
  } else {
    memberCode = await findFreeMemberCode(code)
  }

  const type = input.type ?? 'personal'
  const access = input.access ?? group.access
  
  const created = await db.transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        code: memberCode,
        name: input.name,
        type: type,
        status: 'draft',
        access: access,
        description: input.description ?? '',
        image: toNullableJsonInput(input.image),
        address: input.address,
        contacts: input.contacts,
        meta: input.meta,
        latitude: input.location?.coordinates[1],
        longitude: input.location?.coordinates[0],
        groupId: group.id,
      },
      include: getMemberInclude(),
    })

    await tx.memberUser.create({
      data: {
        tenantId: code,
        memberId: member.id,
        userId: ctx.userId,
        role: 'admin',
      },
    })

    return member
  })

  await syncResourceFiles(code, 'members', created.id, input.image ? [input.image.url] : [])

  return enrichMember(ctx, toMember(created))
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
      const account = await syncAccountStatus(ctx, member, currencyCode, to)
      if (!member.accountId) {
        data.accountId = account.id
      }     
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
    include: getMemberInclude(),
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

  return enrichMember(ctx, toMember(updated))
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
