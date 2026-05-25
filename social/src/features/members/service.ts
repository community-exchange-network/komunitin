import { z } from 'zod'
import { Prisma, type Member as DbMember, type Group as DbGroup } from '../../generated/prisma/client'
import { createAccount, findAccountByCode } from '../../server/accounting'
import type { AuthContext, OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { reorderByIds } from '../../server/query'
import type { CollectionParams, ResourceParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma, { toNullableJsonInput } from '../../utils/prisma'
import { syncResourceFiles } from '../files/service'
import { assertAtMostOneGroupAdmin, getGroupByCode, isGroupAdmin, isGroupMember, toGroup, toLocation } from '../groups/service'
import type { Group } from '../groups/types'
import { type MemberStatus, type PatchMemberAttributes } from './schema'
import type { CreateMemberInput, Member, PatchMemberInput } from './types'
import { findMemberIds } from './sql'

export const toMember = (member: DbMember & {group?: DbGroup}): Member => {
  return {
    ...member,
    location: toLocation(member),
    group: member.group ? toGroup(member.group) : undefined,
  } as Member
}

const getMemberById = async (code: string, id: string, params?: ResourceParams): Promise<Member> => {
  const validation = z.uuid().safeParse(id)
  if (!validation.success) {
    throw notFound('Member not found')
  }

  const db = tenantDb(prisma, code)
  const member = await db.member.findFirst({
    where: {
      id,
      deleted: null,
    },
    include: {
      group: params?.include.includes('group') ?? false,
    },
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
    || (group.status === 'active' && member.status === 'active' && member.access === 'public')  
    || (group.status === 'active' && member.status === 'active' && member.access === 'group' && await isGroupMember(ctx, group))
    || await isMemberUser(ctx, member)
    || await isGroupAdmin(ctx, group)
}

const canWriteMember = async (ctx: AuthContext, group: Group, member: Member): Promise<boolean> => {
  return ctx.isSuperadmin
    || await isMemberUser(ctx, member, "admin")  
    || await isGroupAdmin(ctx, group)
    
}

const validateStatusTransition = async (
  ctx: AuthContext,
  group: Group,
  member: Member,
  to: MemberStatus,
): Promise<void> => {
  const from = member.status

  if (from === to) {
    return
  }

  const admin = ctx.isSuperadmin || await isGroupAdmin(ctx, group)
  const owner = await isMemberUser(ctx, member)

  if (from === 'draft' && to === 'pending' && (owner || admin)) {
    return
  }

  if (from === 'pending' && to === 'active' && admin) {
    // Account creation in accounting service must happen on approval.
    // TODO: Implement remote account creation and persist accountId.
    return
  }

  if (from === 'active' && to === 'inactive' && (owner || admin)) {
    return
  }

  if (from === 'active' && to === 'suspended' && admin) {
    return
  }

  if (from === 'inactive' && to === 'active' && (owner || admin)) {
    return
  }

  if (from === 'suspended' && to === 'active' && admin) {
    return
  }

  throw badRequest('Status transition is not allowed')
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
    .sort()
  
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

const syncMemberActivationAccount = async (
  ctx: AuthContext,
  group: Group,
  member: Member,
): Promise<string> => {
  if (!group.currencyId) {
    throw badRequest('Group is not linked to an accounting currency')
  }
  const currencyCode = group.code

  await assertAtMostOneGroupAdmin(group)

  const userIds = await getMemberUserIds(member)
  if (userIds.length === 0) {
    throw badRequest('Member must have at least one user before activation')
  }

  const account = await findAccountByCode(currencyCode, member.code, ctx.authorization)
    ?? await createAccount(currencyCode, member.code, userIds, ctx.authorization)

  return account.id
}

/**
 * Return all members of a group accessible to the given user.
 * 
 * If no status filter is provided, defaults to 'active' members only.
 */
export const listMembers = async (ctx: OptionalAuthContext, code: string, params: CollectionParams): Promise<Member[]> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)
  
  const defaultFilters = {
    status: 'active',
  }

  const ids = await findMemberIds(ctx, db, group, {
    ...params,
    filters: {
      ...defaultFilters,
      ...params.filters,
    },
  })
  
  if (ids.length === 0) {
    return []
  }

  const members = await db.member.findMany({
    where: {
      id: { in: ids },
    },
    include: {
      group: params.include.includes('group'),
    }
  })

  return reorderByIds(members, ids).map(toMember)
}

export const getMember = async (ctx: OptionalAuthContext, code: string, id: string, params: ResourceParams): Promise<Member> => {
  const group = await getGroupByCode(ctx, code)
  const member = await getMemberById(code, id, params)

  const allowed = await canReadMember(ctx, group, member)
  if (!allowed) {
    throw forbidden('You do not have access to this member')
  }

  return member
}

export const createMember = async (ctx: AuthContext, code: string, input: CreateMemberInput): Promise<Member> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)

  let memberCode = input.code?.trim()
  if (memberCode) {
    const isAdmin = ctx.isSuperadmin || await isGroupAdmin(ctx, group)
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

  return toMember(created)
}

export const patchMember = async (
  ctx: AuthContext,
  code: string,
  id: string,
  input: PatchMemberInput,
): Promise<Member> => {
  const group = await getGroupByCode(ctx, code)
  const member = await getMemberById(code, id)

  const allowed = await canWriteMember(ctx, group, member)
  if (!allowed) {
    throw forbidden('You do not have permission to update this member')
  }

  if (typeof input.status === 'string') {
    await validateStatusTransition(ctx, group, member, input.status)
  }

  const { location, image, ...rest } = input
  const data: Prisma.MemberUpdateInput = {
    ...rest,
    image: toNullableJsonInput(image),
  }

  if (member.status === 'pending' && input.status === 'active') {
    data.accountId = await syncMemberActivationAccount(ctx, group, member)
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

  return toMember(updated)
}
