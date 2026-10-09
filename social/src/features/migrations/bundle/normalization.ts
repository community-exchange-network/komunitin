import type { ParsedMigrationRows } from './schemas'
import type { MigrationImage, MigrationImageOwnerType, MigrationImportPlan, MigrationSummary } from './types'

const image = (
  sourceUrl: string,
  ownerType: MigrationImageOwnerType,
  ownerKey: string,
  position: number,
): MigrationImage => ({
  sourceUrl,
  ownerType,
  ownerKey,
  position,
})

export const normalizedImages = (rows: ParsedMigrationRows): MigrationImage[] => {
  if (rows.community === null) return []
  const images: MigrationImage[] = []
  const community = rows.community.value
  if (community.imageUrl !== null) {
    images.push(image(community.imageUrl, 'community', community.code, 0))
  }
  for (const { value: member } of rows.members) {
    if (member.imageUrl !== null) images.push(image(member.imageUrl, 'member', member.code, 0))
  }
  for (const { value: post } of rows.posts) {
    post.imageUrls.forEach((url, position) => {
      images.push(image(url, post.type, post.code, position))
    })
  }
  return images
}

export const normalizeImportPlan = (rows: ParsedMigrationRows): MigrationImportPlan => {
  const accountsByCode = new Map(rows.accounts.map(({ value }) => [value.code, value]))
  const currency = rows.currency!.value
  return {
    community: {
      ...rows.community!.value,
      currencyId: currency.id,
      currencyAdmin: currency.adminUser,
    },
    users: rows.users.map(({ value }) => value),
    memberUsers: rows.memberUsers.map(({ value }) => value),
    members: rows.members.map(({ value }) => {
      const account = accountsByCode.get(value.code)
      return {
        ...value,
        accountId: account?.id ?? null,
      }
    }),
    accounting: { accounts: rows.accounts.length, transfers: rows.transfers },
    categories: rows.categories.map(({ value }) => value),
    posts: rows.posts.map(({ value }) => value),
    images: normalizedImages(rows),
  }
}

export const summarizeImportPlan = (plan: MigrationImportPlan): MigrationSummary => ({
  users: plan.users.length,
  memberUsers: plan.memberUsers.length,
  members: plan.members.length,
  ...plan.accounting,
  categories: plan.categories.length,
  offers: plan.posts.filter((post) => post.type === 'offer').length,
  needs: plan.posts.filter((post) => post.type === 'need').length,
  images: plan.images.length,
})
