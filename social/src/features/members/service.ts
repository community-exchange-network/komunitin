import { z } from 'zod'
import { Prisma, type Member as DbMember } from '../../generated/prisma/client'
import type { AuthContext, OptionalAuthContext } from '../../server/context'
import { tenantDb } from '../../server/multitenant'
import { orderBySort, whereFilter } from '../../server/query'
import type { CollectionParams } from '../../server/request'
import { badRequest, forbidden, notFound } from '../../utils/error'
import prisma from '../../utils/prisma'
import { getGroupByCode, isGroupAdmin, isGroupMember, toLocation } from '../groups/service'
import type { Group } from '../groups/types'
import { type MemberStatus, type PatchMemberAttributes } from './schema'
import type { CreateMemberInput, Member, PatchMemberInput } from './types'

export const toMember = (member: DbMember): Member => {
  return {
    ...member,
    location: toLocation(member),
  } as Member
}

const getMemberById = async (code: string, id: string): Promise<Member> => {
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

const buildReadableMemberWhere = async (
  ctx: OptionalAuthContext,
  group: Group,
): Promise<Prisma.MemberWhereInput | null> => {
  // Superadmins, and group admins can read all members
  if (ctx.isSuperadmin || await isGroupAdmin(ctx, group)) {
    return {}
  }

  const visibilityWhere: Prisma.MemberWhereInput[] = []

  // For active groups, add active members visible to the public or the group
  if (group.status === 'active') {
    const isMember = await isGroupMember(ctx, group)
    visibilityWhere.push({
      status: 'active',
      access: isMember ? { in: ['public', 'group'] } : 'public',
    })
  }
  // Add own members
  if (ctx.userId) {
    visibilityWhere.push({
      users: {
        some: {
          userId: ctx.userId,
        },
      },
    })
  }

  if (visibilityWhere.length === 0) {
    return null
  }

  return { OR: visibilityWhere }
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

export const listMembers = async (ctx: OptionalAuthContext, code: string, params?: CollectionParams): Promise<Member[]> => {
  const group = await getGroupByCode(ctx, code)
  const db = tenantDb(prisma, code)
  const filterWhere = params ? whereFilter(params.filters) : {}
  const visibilityWhere = await buildReadableMemberWhere(ctx, group)

  if (visibilityWhere === null) {
    return []
  }

  const members = await db.member.findMany({
    where: {
      AND: [
        filterWhere,
        { deleted: null },
        visibilityWhere,
      ],
    },
    orderBy: params ? orderBySort(params.sort) : { created: 'asc' },
    skip: params?.pagination.cursor,
    take: params?.pagination.size,
  })

  return members.map(toMember)
}

export const getMember = async (ctx: OptionalAuthContext, code: string, id: string): Promise<Member> => {
  const group = await getGroupByCode(ctx, code)
  const member = await getMemberById(code, id)

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
        image: input.image,
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

  const { location, ...rest } = input
  const data: PatchMemberAttributes & {
    latitude?: number
    longitude?: number
  } = {
    ...rest,
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
    data: {
      ...data,
      image: input.image,
      address: input.address,
      contacts: input.contacts,
      meta: input.meta,
    },
  })

  return toMember(updated)
}
