import { Group, GroupAdminUser, Member, MemberUser, User } from '../../src/generated/prisma/client'
import { mockDb } from './prisma'

let groupIdCounter = 0
let memberIdCounter = 0
let userCounter = 0

export type MockDatabase = NonNullable<ReturnType<typeof mockDb>>

type SeedGroupInput = Partial<Group> & {
  tenantId: string
}

type SeedMemberInput = Partial<Member> & {
  tenantId: string
  userId?: string
}

const defaultUserData = () => {
  userCounter++
  return {
    id: `user-${userCounter}`,
    email: `user-${userCounter}@example.com`,
    settings: {},
    created: new Date(),
    updated: new Date(),
  }
}

const defaultGroupData = () => {
  groupIdCounter++
  return {
    id: `group-${groupIdCounter}`,
    name: `Test Group ${groupIdCounter}`,
    description: `Description for Test Group ${groupIdCounter}`,
    status: 'active',
    access: 'public',
    image: null,
    address: null,
    contacts: null,
    latitude: null,
    longitude: null,
    meta: {},
    settings: {},
    created: new Date(),
    updated: new Date(),
    deleted: null,
    currencyId: `currency-${groupIdCounter}`,
  }
}

const defaultMemberData = () => {
  memberIdCounter++
  return {
    id: `member-${memberIdCounter}`,
    code: `member-${memberIdCounter}`,
    name: `Test Member ${memberIdCounter}`,
    type: 'personal',
    state: 'active',
    access: 'public',
    description: `Description for Test Member ${memberIdCounter}`,
    image: null,
    address: null,
    contacts: null,
    latitude: null,
    longitude: null,
    meta: {},
    accountId: `account-${memberIdCounter}`,
    created: new Date(),
    updated: new Date(),
    deleted: null,
  }
}

export const seedUser = (db: MockDatabase, data?: Partial<User>): User => {
  const user = {
    ...defaultUserData(),
    ...data,
  } as User

  db.user!.push(user)
  return user
}

export const seedGroup = (
  db: MockDatabase,
  data: SeedGroupInput,
): Group => {

  const group = {
    ...defaultGroupData(),
    ...data,
  } as Group

  db.group!.push(group)

  seedGroupAdmin(db, {
    tenantId: group.tenantId,
  })

  return group
}

/**
 * Seed group first.
 */
export const seedGroupAdmin = (
  db: MockDatabase,
  data: {
    tenantId: string
    userId?: string
  }
): GroupAdminUser => {
  // find group
  const group = db.group!.find((item) => item.tenantId === data.tenantId)!
  const userId = data.userId ?? `group-admin-${groupIdCounter}`

  // Ensure user exists
  if (!db.user!.find((u) => u.id === userId)) {
    seedUser(db, { id: userId })
  }
    
  
  const relation: GroupAdminUser = {
    groupId: group.id,
    role: 'admin',
    userId,
    ...data,
  }

  db.groupAdminUser!.push(relation)
  return relation
}

export const seedMember = (
  db: MockDatabase,
  data: SeedMemberInput,
): Member => {
  
  const group = db.group!.find((item) => item.tenantId === data.tenantId)!

  const member = {
    groupId: group.id,
    ...defaultMemberData(),
    ...data,
  } as Member

  db.member!.push(member)

  seedMemberUser(db, {
    tenantId: data.tenantId,
    memberId: member.id,
    userId: data.userId,
  })

  return member
}

export const seedMemberUser = (
  db: MockDatabase,
  data: Partial<MemberUser> & {
    tenantId: string
    memberId: string
  }
): MemberUser => {
  const userId = data.userId ?? `member-user-${memberIdCounter}`

  // Ensure user exists
  if (!db.user!.find((u) => u.id === userId)) {
    seedUser(db, { id: userId })
  }

  const relation: MemberUser = {
    role: 'admin',
    ...data,
    userId,
  }

  db.memberUser!.push(relation)
  return relation
}

