import type { MigrationBundleFilename } from '../../../../social/src/features/migrations/bundle/constants'

export type IcesRow = Record<string, string>
export type IcesRows = Record<MigrationBundleFilename, IcesRow[]>

/** Drupal social UUIDs encode the original 32-bit UID in their last 12 digits. */
export const icesUserUid = (id: string) => {
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)) {
    throw new Error('Expected an ICES user UUID')
  }
  const uid = Number.parseInt(id.slice(-12), 16)
  if (uid < 1 || uid > 0xffffffff) throw new Error('Invalid ICES user UID')
  return uid
}
