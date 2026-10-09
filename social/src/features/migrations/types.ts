import type { Prisma } from '../../generated/prisma/client'
import type { MigrationImportPlan, MigrationUser } from './bundle/types'

/** Auth has supplied a canonical UUID for every user. */
export type IdentifiedMigrationPlan = Omit<MigrationImportPlan, 'users'> & {
  users: (MigrationUser & { id: string })[]
}

export interface AccountingReference {
  id: string
  href: string
}

/** Only the links needed to persist Social records cross this boundary. */
export interface AccountingReferences {
  currency: AccountingReference
  accounts: ReadonlyMap<string, AccountingReference>
}

export type MigrationLog = (
  level: 'info' | 'warn' | 'error',
  step: string,
  message: string,
  data?: Prisma.InputJsonObject,
) => Promise<void>

/** Reuse a natural-key match only when every supplied identity agrees. */
export const matchingRecord = <T extends { id: string }>(
  label: string,
  suppliedId: string | null,
  candidates: T[],
  matches: (candidate: T) => boolean,
): T | undefined => {
  const existing = candidates[0]
  if (candidates.length > 1 || (existing && (!matches(existing) || (suppliedId && suppliedId !== existing.id)))) {
    throw new MigrationConflict(`${label}: conflicting UUID or relationship; resolve manually and re-upload`)
  }
  return existing
}

export class MigrationConflict extends Error {}
