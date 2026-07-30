import type { ParsedMigrationRows } from './schemas'
import type { MigrationImage, MigrationImageOwnerType, MigrationImportPlan, MigrationSummary } from './types'

export const deriveImageSourceKey = (
  ownerType: MigrationImageOwnerType,
  ownerKey: string,
  position: number,
): string => `${ownerType}:${ownerKey}:image:${position}`

const image = (
  sourceUrl: string,
  ownerType: MigrationImageOwnerType,
  ownerKey: string,
  position: number,
): MigrationImage => ({
  sourceKey: deriveImageSourceKey(ownerType, ownerKey, position),
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

export const normalizeImportPlan = (rows: ParsedMigrationRows): MigrationImportPlan => ({
  community: rows.community!.value,
  users: rows.users.map(({ value }) => value),
  members: rows.members.map(({ value }) => value),
  transfers: rows.transfers.map(({ value }) => value),
  categories: rows.categories.map(({ value }) => value),
  posts: rows.posts.map(({ value }) => value),
  images: normalizedImages(rows),
})

export const summarizeImportPlan = (plan: MigrationImportPlan): MigrationSummary => ({
  users: plan.users.length,
  members: plan.members.length,
  accounts: plan.members.filter((member) => member.account !== null).length,
  transfers: plan.transfers.length,
  categories: plan.categories.length,
  offers: plan.posts.filter((post) => post.type === 'offer').length,
  wants: plan.posts.filter((post) => post.type === 'want').length,
  images: plan.images.length,
})

