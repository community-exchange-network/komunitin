import type { Prisma } from '../../generated/prisma/client'
import { privilegedDb } from '../../server/multitenant'
import prisma from '../../utils/prisma'
import { defaultMemberUserSettings } from '../member-users/settings'
import type { MigrationAddress, MigrationEmailFrequency } from './bundle/types'
import type { MigrationImportPlan } from './bundle'
import type { checkAccounting } from './accounting'
import { matchingRecord, type MigrationLog } from './types'

const emailFrequency = (frequency: MigrationEmailFrequency | null) =>
  frequency === 'daily' ? 'weekly' : frequency === 'quarterly' ? 'monthly' : frequency ?? 'monthly'
const supplied = <T extends object>(value: T) => Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== null))
const address = (value: MigrationAddress | null) => value ? supplied({
  streetAddress: value.streetAddress, addressLocality: value.locality, postalCode: value.postalCode,
  addressRegion: value.region, addressCountry: value.country,
}) : {}
const dates = (row: { createdAt: string | null, updatedAt: string | null }) => {
  const created = new Date(row.createdAt || row.updatedAt || Date.now())
  return { created, updated: row.updatedAt ? new Date(row.updatedAt) : created }
}

export type ImageOwner = {
  type: 'groups' | 'members' | 'offers' | 'needs'
  id: string
  urls: string[]
  uploaderId: string
}

/** Direct inserts preserve legacy states and dates without operational side effects. */
export const persistSocial = async (
  migrationId: string,
  plan: MigrationImportPlan,
  accounting: Awaited<ReturnType<typeof checkAccounting>>,
  log: MigrationLog,
  assertActive: () => void,
) => {
  const db = privilegedDb(prisma)
  const tenantId = plan.community.code
  const owners: ImageOwner[] = []
  // Record provenance atomically with each insert, including for interrupted image imports.
  const create = <T extends { id: string }>(type: string, key: string, insert: (tx: Prisma.TransactionClient) => Promise<T>) =>
    db.transaction(async tx => {
      assertActive()
      const record = await insert(tx)
      await tx.migrationEvent.create({ data: {
        migrationId, level: 'info', step: 'create', message: `Created ${type} ${key}`,
        data: { resourceType: type, resourceId: record.id },
      } })
      return record
    })

  for (const user of plan.users) {
    const existing = matchingRecord(`User ${user.email}`, user.id, await db.user.findMany({ where: {
      OR: [{ email: user.email }, { id: user.id! }],
    } }), candidate => candidate.email === user.email)
    if (!existing) await create('users', user.email, tx => tx.user.create({ data: {
      id: user.id!, email: user.email, name: user.name, language: user.language, ...dates(user),
    } }))
  }
  await log('info', 'users', 'Social identity projections ready', { total: plan.users.length })
  const userIds = new Map(plan.users.map(user => [user.email, user.id!]))
  const source = plan.community
  const groupCandidates = await db.group.findMany({ where: { OR: [
    { tenantId }, ...(source.id ? [{ id: source.id }] : []),
  ] } })
  const existingGroup = matchingRecord(`Community ${tenantId}`, source.id, groupCandidates, candidate =>
    candidate.tenantId === tenantId && candidate.currencyId === accounting.currency.id && candidate.deleted === null)
  const group = existingGroup ?? await create('groups', tenantId, tx => tx.group.create({ data: {
    id: source.id ?? undefined, tenantId, name: source.name, description: source.description,
    status: source.status, access: source.access, address: address(source.address),
    latitude: source.location?.latitude, longitude: source.location?.longitude,
    contacts: source.contacts.map(contact => ({ ...contact })),
    settings: { ...supplied(source.settings), defaultGroupEmailFrequency: emailFrequency(source.settings.defaultGroupEmailFrequency) },
    currencyId: accounting.currency.id, currencyHref: accounting.currency.links.self, ...dates(source),
  } }))
  for (const email of source.adminUsers) {
    const userId = userIds.get(email)!
    const existing = await db.groupAdminUser.findUnique({ where: { groupId_userId: { groupId: group.id, userId } } })
    assertActive()
    if (!existing) await db.groupAdminUser.create({ data: { tenantId, groupId: group.id, userId } })
  }
  const fallbackUploader = userIds.get(source.adminUsers[0])!
  if (source.imageUrl) owners.push({ type: 'groups', id: group.id, urls: [source.imageUrl], uploaderId: fallbackUploader })
  await log('info', 'community', existingGroup ? 'Reused community; existing values preserved' : 'Community created', { id: group.id })

  const ownersByMember = Map.groupBy(plan.memberUsers, row => row.member)
  const members = new Map<string, string>()
  const uploaders = new Map<string, string>()
  for (const row of plan.members) {
    const account = accounting.accounts.get(row.code)
    const candidates = await db.member.findMany({ where: { OR: [
      { tenantId, code: row.code }, ...(row.id ? [{ id: row.id }] : []),
    ] } })
    const existing = matchingRecord(`Member ${row.code}`, row.id, candidates, candidate =>
      candidate.tenantId === tenantId && candidate.code === row.code && candidate.groupId === group.id
      && candidate.accountId === (account?.id ?? null))
    const member = existing ?? await create('members', row.code, tx => tx.member.create({ data: {
      id: row.id ?? undefined, tenantId, groupId: group.id, code: row.code, name: row.name,
      type: row.type, status: row.status, access: row.access, description: row.description,
      address: address(row.address), contacts: row.contacts.map(contact => ({ ...contact })),
      latitude: row.location?.latitude, longitude: row.location?.longitude,
      accountId: account?.id, accountHref: account?.links.self,
      deleted: row.deleted ? new Date(row.deleted) : null, ...dates(row),
    } }))
    members.set(row.code, member.id)
    const owner = ownersByMember.get(row.code)?.[0]?.user
    const uploaderId = owner ? userIds.get(owner)! : fallbackUploader
    uploaders.set(row.code, uploaderId)
    if (row.imageUrl) owners.push({ type: 'members', id: member.id, urls: [row.imageUrl], uploaderId })
  }
  await log('info', 'members', 'Members ready', { total: members.size })

  const defaultFrequency = (group.settings as { defaultGroupEmailFrequency?: 'never' | 'weekly' | 'monthly' }).defaultGroupEmailFrequency
  for (const row of plan.memberUsers) {
    const memberId = members.get(row.member)!
    const userId = userIds.get(row.user)!
    const candidates = await db.memberUser.findMany({ where: { OR: [
      { memberId, userId }, ...(row.id ? [{ id: row.id }] : []),
    ] } })
    const existing = matchingRecord(`Membership ${row.member}/${row.user}`, row.id, candidates, candidate =>
      candidate.tenantId === tenantId && candidate.memberId === memberId && candidate.userId === userId)
    const defaults = defaultMemberUserSettings(defaultFrequency)
    if (!existing) await create('member-users', `${row.member}/${row.user}`, tx => tx.memberUser.create({ data: {
      id: row.id ?? undefined, tenantId, memberId, userId,
      settings: {
        notifications: { ...defaults.notifications, ...supplied(row.notifications) },
        emails: { myAccount: row.emails.myAccount ?? defaults.emails.myAccount,
          group: row.emails.group ? emailFrequency(row.emails.group) : defaults.emails.group },
      },
    } }))
  }
  await log('info', 'memberships', 'Memberships ready', { total: plan.memberUsers.length })

  const categories = new Map<string, string>()
  for (const row of plan.categories) {
    const candidates = await db.category.findMany({ where: { OR: [
      { tenantId, code: row.code }, ...(row.id ? [{ id: row.id }] : []),
    ] } })
    const existing = matchingRecord(`Category ${row.code}`, row.id, candidates, candidate =>
      candidate.tenantId === tenantId && candidate.code === row.code && candidate.groupId === group.id)
    const category = existing ?? await create('categories', row.code, tx => tx.category.create({ data: {
      id: row.id ?? undefined, tenantId, groupId: group.id, code: row.code, name: row.name,
      access: row.access, icon: row.icon ? { ...row.icon } : undefined,
      meta: row.description ? { description: row.description } : undefined, ...dates(row),
    } }))
    categories.set(row.code, category.id)
  }
  await log('info', 'categories', 'Categories ready', { total: categories.size })

  for (const row of plan.posts) {
    const type = row.type === 'offer' ? 'offers' : 'needs'
    const memberId = members.get(row.member)!
    const categoryId = row.category ? categories.get(row.category)! : null
    const candidates = await db.post.findMany({ where: { OR: [
      { tenantId, code: row.code }, ...(row.id ? [{ id: row.id }] : []),
    ] } })
    const existing = matchingRecord(`Post ${row.code}`, row.id, candidates, candidate =>
      candidate.tenantId === tenantId && candidate.code === row.code && candidate.type === type
      && candidate.groupId === group.id && candidate.memberId === memberId && candidate.categoryId === categoryId)
    const post = existing ?? await create(type, row.code, tx => tx.post.create({ data: {
      id: row.id ?? undefined, tenantId, groupId: group.id, memberId, categoryId, type,
      code: row.code, title: row.title, description: row.description, status: row.status, access: row.access,
      data: type === 'offers' ? { value: row.value } : { fulfilled: row.fulfilledAt },
      latitude: row.location?.latitude, longitude: row.location?.longitude,
      expires: row.expiresAt ? new Date(row.expiresAt) : null, ...dates(row),
    } }))
    if (row.imageUrls.length) owners.push({ type, id: post.id, urls: row.imageUrls, uploaderId: uploaders.get(row.member)! })
  }
  await log('info', 'posts', 'Offers and needs ready', { total: plan.posts.length })
  return owners
}
