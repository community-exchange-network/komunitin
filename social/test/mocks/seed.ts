import { Prisma } from '../../src/generated/prisma/client'
import type { Category, File, Group, GroupAdminUser, Member, MemberUser, Post, User } from '../../src/generated/prisma/client'
import { privilegedDb } from '../../src/server/multitenant'
import prisma from '../../src/utils/prisma'
import { toUuid } from './utils'

let groupCounter = 0
let memberCounter = 0
let userCounter = 0
let categoryCounter = 0
let postCounter = 0
let fileCounter = 0

type SeedGroupInput = Omit<Partial<Group>, 'tenantId'> & {
  tenantId: string
}

type SeedMemberInput = Omit<Partial<Member>, 'tenantId' | 'groupId'> & {
  tenantId: string
  userId?: string
}

type SeedPostInput = Omit<Partial<Post>, 'tenantId' | 'groupId' | 'memberId'> & {
  tenantId: string
  memberId: string
}

type SeedCategoryInput = Omit<Partial<Category>, 'tenantId' | 'groupId'> & {
  tenantId: string
}

type SeedFileInput = Omit<Partial<File>, 'tenantId' | 'uploaderId'> & {
  tenantId: string
  uploaderId?: string
}

const db = () => privilegedDb(prisma)

const defaultUserData = () => {
  userCounter++
  return {
    id: toUuid(`seed-user-${userCounter}`),
    email: `seed-user-${userCounter}@example.org`,
  }
}

const defaultGroupData = () => {
  groupCounter++
  return {
    name: `Test Group ${groupCounter}`,
    description: `Description for Test Group ${groupCounter}`,
    status: 'active',
    access: 'public',
  }
}

const defaultMemberData = () => {
  memberCounter++
  return {
    code: `member-${memberCounter}`,
    name: `Test Member ${memberCounter}`,
    type: 'personal',
    status: 'active',
    access: 'public',
    description: `Description for Test Member ${memberCounter}`,
  }
}

const defaultCategoryData = () => {
  categoryCounter++
  return {
    code: `category-${categoryCounter}`,
    name: `Test Category ${categoryCounter}`,
    access: 'public',
  }
}

const defaultPostData = () => {
  postCounter++
  return {
    code: `post-${postCounter}`,
    type: 'offers',
    title: `Test Post ${postCounter}`,
    description: `Description for Test Post ${postCounter}`,
    status: 'public',
    access: 'public',
  }
}

const defaultFileData = (tenantId: string, resourceType = 'members') => {
  fileCounter++
  const key = `${tenantId}/${resourceType}/seed-file-${fileCounter}.png`
  return {
    key,
    url: `http://komunitin.s3.test/uploads/${key}`,
    mime: 'image/png',
    filename: `seed-file-${fileCounter}.png`,
    size: 68,
    resourceType,
  }
}

const getGroupByTenant = async (tenantId: string) => {
  const group = await db().group.findFirst({
    where: { tenantId },
  })

  if (!group) {
    throw new Error(`Seed group first for tenant ${tenantId}`)
  }

  return group
}

const toNullableJson = (value: unknown): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined => {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return Prisma.JsonNull
  }

  return value as Prisma.InputJsonValue
}

export const resetDb = async () => {
  groupCounter = 0
  memberCounter = 0
  userCounter = 0
  categoryCounter = 0
  postCounter = 0
  fileCounter = 0
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "File", "Post", "Category", "MemberUser", "GroupAdminUser", "Member", "Group", "User" RESTART IDENTITY CASCADE'
  )
}

export const seedUser = async (data: Partial<User> = {}): Promise<User> => {
  const defaults = defaultUserData()
  const id = toUuid(data.id ?? defaults.id)
  const input = {
    email: data.email ?? defaults.email,
    name: data.name,
    settings: toNullableJson(data.settings), 
  }
  
  return db().user.upsert({
    where: { id },
    create: {
      id,
      ...input
    },
    update: input,
  })
}

export const seedGroup = async (data: SeedGroupInput): Promise<Group> => {
  const defaults = defaultGroupData()

  const group = await db().group.create({
    data: {
      ...(data.id ? { id: toUuid(data.id) } : {}),
      tenantId: data.tenantId,
      name: data.name ?? defaults.name,
      description: data.description ?? defaults.description,
      status: data.status ?? defaults.status,
      access: data.access ?? defaults.access,
      image: toNullableJson(data.image),
      address: toNullableJson(data.address),
      contacts: toNullableJson(data.contacts),
      latitude: data.latitude,
      longitude: data.longitude,
      meta: toNullableJson(data.meta),
      settings: toNullableJson(data.settings),
      deleted: data.deleted,
      currencyId: data.currencyId,
    },
  })

  await seedGroupAdmin({
    tenantId: data.tenantId,
  })

  return group
}

export const seedGroupAdmin = async (data: { tenantId: string; userId?: string }): Promise<GroupAdminUser> => {
  const group = await getGroupByTenant(data.tenantId)
  const userId = toUuid(data.userId ?? `seed-group-admin-${data.tenantId}`)

  await seedUser({
    id: userId,
  })

  const existing = await db().groupAdminUser.findFirst({
    where: {
      groupId: group.id,
      userId,
    },
  })

  if (existing) {
    return existing
  }

  return db().groupAdminUser.create({
    data: {
      tenantId: group.tenantId,
      groupId: group.id,
      userId,
      role: 'admin',
    },
  })
}

export const seedMember = async (data: SeedMemberInput): Promise<Member> => {
  const group = await getGroupByTenant(data.tenantId)
  const defaults = defaultMemberData()
  const {userId, ...input} = data

  const member = await db().member.create({
    data: {
      ...defaults,
      ...input,
      ...(data.id ? { id: toUuid(data.id) } : {}),
      groupId: group.id,
      image: toNullableJson(data.image),
      address: toNullableJson(data.address),
      contacts: toNullableJson(data.contacts),
      meta: toNullableJson(data.meta),
      accountId: data.accountId ? toUuid(data.accountId) : undefined,
    },
  })

  await seedMemberUser({
    tenantId: data.tenantId,
    memberId: member.id,
    userId,
  })

  return member
}

export const seedMemberUser = async (
  data: Partial<MemberUser> & {
    tenantId: string
    memberId: string
  }
): Promise<MemberUser> => {
  const userId = toUuid(data.userId ?? `seed-member-user-${data.memberId}`)

  await seedUser({
    id: userId,
  })

  const existing = await db().memberUser.findFirst({
    where: {
      memberId: toUuid(data.memberId),
      userId,
    },
  })

  if (existing) {
    return existing
  }

  return db().memberUser.create({
    data: {
      tenantId: data.tenantId,
      memberId: toUuid(data.memberId),
      userId,
      role: data.role ?? 'admin',
    },
  })
}

export const seedCategory = async (data: SeedCategoryInput): Promise<Category> => {
  const group = await getGroupByTenant(data.tenantId)
  const defaults = defaultCategoryData()

  return db().category.create({
    data: {
      ...defaults,
      ...data,
      ...(data.id ? { id: toUuid(data.id) } : {}),
      groupId: group.id,
      icon: toNullableJson(data.icon),
      meta: toNullableJson(data.meta),
    },
  })
}

export const seedPost = async (data: SeedPostInput): Promise<Post> => {
  const group = await getGroupByTenant(data.tenantId)
  const defaults = defaultPostData()
  const { expires, ...rest } = data

  return db().post.create({
    data: {
      ...defaults,
      ...rest,
      ...(data.id ? { id: toUuid(data.id) } : {}),
      ...(expires ? { expires } : {}),
      memberId: toUuid(data.memberId),
      groupId: group.id,
      images: toNullableJson(data.images),
    } as any,
  })
}

export const seedFile = async (data: SeedFileInput): Promise<File> => {
  const defaults = defaultFileData(data.tenantId, data.resourceType ?? undefined)
  const uploaderId = toUuid(data.uploaderId ?? `seed-file-uploader-${data.tenantId}`)

  await seedUser({
    id: uploaderId,
  })

  const created = await db().file.create({
    data: {
      id: data.id ? toUuid(data.id) : undefined,
      tenantId: data.tenantId,
      mime: data.mime ?? defaults.mime,
      key: data.key ?? defaults.key,
      url: data.url ?? defaults.url,
      filename: data.filename ?? defaults.filename,
      size: data.size ?? defaults.size,
      resourceType: data.resourceType ?? defaults.resourceType,
      resourceId: data.resourceId === undefined ? null : data.resourceId,
      uploaderId,
      created: data.created,
    },
  })

  if (data.created || data.updated) {
    const createdAt = data.created ?? created.created
    const updatedAt = data.updated ?? created.updated
    await db().$executeRaw`
      UPDATE "File"
      SET "created" = ${createdAt}, "updated" = ${updatedAt}
      WHERE "id" = ${created.id}::uuid
    `
  }

  return await db().file.findUniqueOrThrow({
    where: {
      id: created.id,
    },
  })
}
