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
  type: 'phone' | 'email' | 'telegram' | 'whatsapp' | 'website'
  value: string
}

export interface MigrationMemberUserSettings {
  notifications: {
    myAccount: boolean | null
    group: boolean | null
  }
  emails: {
    myAccount: boolean | null
    group: 'never' | 'weekly' | 'monthly' | null
  }
}

export interface MigrationCommunitySettings {
  requireAcceptTerms: boolean | null
  terms: string | null
  minOffers: number | null
  minNeeds: number | null
  allowAnonymousMemberList: boolean | null
  enableGroupEmail: boolean | null
  defaultGroupEmailFrequency: 'never' | 'weekly' | 'monthly' | null
}

export interface MigrationPaymentSettings {
  allowPayments: boolean | null
  allowPaymentRequests: boolean | null
  allowSimplePayments: boolean | null
  allowSimplePaymentRequests: boolean | null
  allowQrPayments: boolean | null
  allowQrPaymentRequests: boolean | null
  allowMultiplePayments: boolean | null
  allowMultiplePaymentRequests: boolean | null
  allowTagPayments: boolean | null
  allowTagPaymentRequests: boolean | null
  acceptPaymentsAutomatically: boolean | null
  allowExternalPayments: boolean | null
  allowExternalPaymentRequests: boolean | null
  acceptExternalPaymentsAutomatically: boolean | null
}

export interface MigrationCurrencySettings {
  defaultInitialCreditLimit: string | null
  externalTraderCreditLimit: string | null
  defaultInitialMaximumBalance: string | false | null
  defaultOnPaymentCreditLimit: string | false | null
  externalTraderMaximumBalance: string | false | null
  defaultAcceptPaymentsAfter: number | false | null
  defaultAcceptPaymentsWhitelist: string[]
  defaultAllowPayments: boolean | null
  defaultAllowPaymentRequests: boolean | null
  defaultAllowSimplePayments: boolean | null
  defaultAllowSimplePaymentRequests: boolean | null
  defaultAllowQrPayments: boolean | null
  defaultAllowQrPaymentRequests: boolean | null
  defaultAllowMultiplePayments: boolean | null
  defaultAllowMultiplePaymentRequests: boolean | null
  defaultAllowTagPayments: boolean | null
  defaultAllowTagPaymentRequests: boolean | null
  defaultAcceptPaymentsAutomatically: boolean | null
  defaultAllowExternalPayments: boolean | null
  defaultAllowExternalPaymentRequests: boolean | null
  defaultAcceptExternalPaymentsAutomatically: boolean | null
  enableExternalPayments: boolean | null
  enableExternalPaymentRequests: boolean | null
  enableCreditCommonsPayments: boolean | null
  defaultHideBalance: boolean | null
}

export interface MigrationAccountSettings extends MigrationPaymentSettings {
  onPaymentCreditLimit: string | null
  acceptPaymentsAfter: number | null
  acceptPaymentsWhitelist: string[]
  hideBalance: boolean | null
}

export interface MigrationCommunity {
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
  currency: {
    code: string
    adminUser: string
    name: string
    namePlural: string
    symbol: string
    decimals: number
    scale: number
    rateNumerator: number
    rateDenominator: number
    createdAt: string
    updatedAt: string
    settings: MigrationCurrencySettings
  }
}

export interface MigrationUser {
  email: string
  name: string | null
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
  passwordHash: string | null
  language: string | null
}

export interface MigrationMemberUser extends MigrationMemberUserSettings {
  member: string
  user: string
}

export interface MigrationAccount {
  code: string
  status: 'active' | 'disabled' | 'suspended' | 'deleted'
  users: string[]
  balance: string
  creditLimit: string
  maximumBalance: string | null
  createdAt: string
  updatedAt: string
  settings: MigrationAccountSettings
}

export interface MigrationMember {
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
  account: MigrationAccount | null
}

export interface MigrationTransfer {
  id: string
  payer: string
  payee: string
  user: string
  amount: string
  description: string
  createdAt: string
  updatedAt: string
}

export interface MigrationCategory {
  code: string
  name: string
  description: string | null
  access: 'public' | 'group' | 'private'
  createdAt: string
  updatedAt: string
  icon: { type: string, value: string } | null
}

export interface MigrationPost {
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
  transfers: MigrationTransfer[]
  categories: MigrationCategory[]
  posts: MigrationPost[]
  images: MigrationImage[]
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
