import type { MigrationParserLimits } from './constants'

export type MigrationBundleInput =
  | { type: 'zip', bytes: Uint8Array }
  | { type: 'directory', path: string }

export interface MigrationValidationError {
  code: string
  message: string
  file: string | null
  row: number | null
  column: string | null
}

export interface MigrationAddress {
  streetAddress: string | null
  locality: string | null
  postalCode: string | null
  region: string | null
  country: string | null
}

export interface MigrationLocation {
  type: 'Point'
  longitude: number
  latitude: number
}

export interface MigrationContact {
  type: 'phone' | 'email' | 'telegram' | 'whatsapp' | 'website' | 'instagram' | 'facebook' | 'twitter'
  value: string
}

export type MigrationEmailFrequency = 'never' | 'daily' | 'weekly' | 'monthly' | 'quarterly'

export interface MigrationMemberUserSettings {
  notifications: {
    myAccount: boolean | null
    group: boolean | null
  }
  emails: {
    myAccount: boolean | null
    group: MigrationEmailFrequency | null
  }
}

export interface MigrationCommunitySettings {
  requireAcceptTerms: boolean | null
  terms: string | null
  minOffers: number | null
  minNeeds: number | null
  allowAnonymousMemberList: boolean | null
  enableGroupEmail: boolean | null
  defaultGroupEmailFrequency: MigrationEmailFrequency | null
}

export interface MigrationCommunity {
  id: string | null
  currencyId: string | null
  currencyAdmin: string | null
  status: 'pending' | 'active' | 'disabled'
  code: string
  name: string
  description: string
  access: 'public' | 'group' | 'private'
  adminUsers: string[]
  createdAt: string
  updatedAt: string
  imageUrl: string | null
  address: MigrationAddress | null
  location: MigrationLocation | null
  contacts: MigrationContact[]
  settings: MigrationCommunitySettings
}

export interface MigrationUser {
  id: string | null
  email: string
  name: string | null
  status: 'active' | 'disabled' | null
  createdAt: string | null
  updatedAt: string | null
  passwordHash: string | null
  language: string | null
}

export interface MigrationMemberUser extends MigrationMemberUserSettings {
  id: string | null
  member: string
  user: string
}

export interface MigrationMember {
  id: string | null
  code: string
  name: string
  type: 'personal' | 'business' | 'organization' | 'public'
  status: 'draft' | 'pending' | 'active' | 'disabled' | 'suspended' | 'deleted'
  access: 'public' | 'group' | 'private'
  description: string
  createdAt: string
  updatedAt: string
  deleted: string | null
  imageUrl: string | null
  address: MigrationAddress | null
  location: MigrationLocation | null
  contacts: MigrationContact[]
  accountId: string | null
}

export interface MigrationCategory {
  id: string | null
  code: string
  name: string
  description: string | null
  access: 'public' | 'group' | 'private'
  createdAt: string
  updatedAt: string
  icon: { type: string, value: string } | null
}

export interface MigrationPost {
  id: string | null
  code: string
  type: 'offer' | 'need'
  member: string
  category: string | null
  title: string | null
  description: string
  status: 'draft' | 'published' | 'hidden'
  access: 'public' | 'group' | 'private'
  value: string | null
  fulfilledAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  location: MigrationLocation | null
  imageUrls: string[]
}

export type MigrationImageOwnerType = 'community' | 'member' | 'offer' | 'need'

export interface MigrationImage {
  sourceUrl: string
  ownerType: MigrationImageOwnerType
  ownerKey: string
  position: number
}

export interface MigrationImportPlan {
  community: MigrationCommunity
  users: MigrationUser[]
  memberUsers: MigrationMemberUser[]
  members: MigrationMember[]
  accounting: { accounts: number, transfers: number }
  categories: MigrationCategory[]
  posts: MigrationPost[]
  images: MigrationImage[]
}

/** Opaque Accounting input, kept separate from Social's normalized plan. */
export interface AccountingFiles {
  'currency.csv': string
  'accounts.csv': string
  'transfers.csv'?: string
}

export interface MigrationSummary {
  users: number
  memberUsers: number
  members: number
  accounts: number
  transfers: number
  categories: number
  offers: number
  needs: number
  images: number
}

export type MigrationParseResult =
  | { success: true, plan: MigrationImportPlan, summary: MigrationSummary }
  | { success: false, errors: MigrationValidationError[] }

export type MigrationParserLimitOverrides = Partial<MigrationParserLimits>
