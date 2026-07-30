import { z, type RefinementCtx } from 'zod'
import { parseExactAmount } from './amounts'
import type { DecodedCsvBundle, CsvRecord } from './csv'
import { ErrorCollector } from './errors'
import type {
  MigrationAddress,
  MigrationCategory,
  MigrationCommunity,
  MigrationContact,
  MigrationLocation,
  MigrationMember,
  MigrationPost,
  MigrationTransfer,
  MigrationUser,
} from './types'

export interface Located<T> {
  value: T
  row: number
}

export interface ParsedMigrationRows {
  community: Located<MigrationCommunity> | null
  users: Located<MigrationUser>[]
  members: Located<MigrationMember>[]
  transfers: Located<MigrationTransfer>[]
  categories: Located<MigrationCategory>[]
  posts: Located<MigrationPost>[]
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/
const COORDINATE_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/
const TIMESTAMP_SCHEMA = z.iso.datetime({ offset: true })

const ACCESS_VALUES = ['public', 'group', 'private'] as const
const EMAIL_FREQUENCY_VALUES = ['never', 'weekly', 'monthly'] as const

interface CsvIssue {
  code: string
  message: string
}

interface IssueContext {
  addIssue: RefinementCtx['addIssue']
}

type FieldResult<T> = { value: T } | CsvIssue
const valid = <T>(value: T): FieldResult<T> => ({ value })
const invalid = (code: string, message: string): CsvIssue => ({ code, message })

const addIssue = (
  ctx: IssueContext,
  code: string,
  message: string,
  path?: PropertyKey[],
): void => ctx.addIssue({ code: 'custom', message, path, params: { migrationCode: code } })

const field = <T>(parse: (raw: string) => FieldResult<T>) => z.string().transform((raw, ctx): T => {
  const result = parse(raw)
  if ('value' in result) return result.value
  addIssue(ctx, result.code, result.message)
  return z.NEVER
})

const required = (maxLength?: number) => field<string>((value) => {
  if (value.length === 0 || value.trim().length === 0) {
    return invalid('REQUIRED_FIELD', 'Value is required')
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return invalid('MAX_LENGTH', `Value must be at most ${maxLength} characters`)
  }
  return valid(value)
})

const optional = (maxLength?: number) => field<string | null>((value) => {
  if (value === '') return valid(null)
  if (value.trim().length === 0) {
    return invalid('INVALID_VALUE', 'Optional value must be blank or contain non-whitespace characters')
  }
  if (maxLength !== undefined && value.length > maxLength) {
    return invalid('MAX_LENGTH', `Value must be at most ${maxLength} characters`)
  }
  return valid(value)
})

const enumValue = <const T extends readonly [string, ...string[]]>(values: T) =>
  field<T[number]>((value) => values.includes(value)
    ? valid(value as T[number])
    : invalid('INVALID_ENUM', `Value must be one of: ${values.join(', ')}`))

const optionalEnumValue = <const T extends readonly [string, ...string[]]>(values: T) =>
  field<T[number] | null>((value) => value === ''
    ? valid(null)
    : values.includes(value)
      ? valid(value as T[number])
      : invalid('INVALID_ENUM', `Value must be one of: ${values.join(', ')}`))

const booleanValue = field<boolean | null>((value) => value === ''
  ? valid(null)
  : value === 'true' || value === 'false'
    ? valid(value === 'true')
    : invalid('INVALID_BOOLEAN', 'Value must be true or false'))

interface IntegerOptions {
  minimum?: number
  maximum?: number
}

const parseInteger = (
  value: string,
  { minimum = 0, maximum = Number.MAX_SAFE_INTEGER }: IntegerOptions = {},
): FieldResult<number> => {
  if (!INTEGER_PATTERN.test(value)) {
    return invalid('INVALID_INTEGER', 'Value must be a non-negative base-10 integer')
  }
  const integer = Number(value)
  return Number.isSafeInteger(integer) && integer >= minimum && integer <= maximum
    ? valid(integer)
    : invalid('INVALID_INTEGER', `Value must be between ${minimum} and ${maximum}`)
}

const integer = (options: IntegerOptions = {}) => field<number>((value) => parseInteger(value, options))
const optionalInteger = (options: IntegerOptions = {}) => field<number | null>((value) =>
  value === '' ? valid(null) : parseInteger(value, options))

const email = field<string>((raw) => {
  const value = raw.trim().toLowerCase()
  return EMAIL_PATTERN.test(value)
    ? valid(value)
    : invalid('INVALID_EMAIL', 'Value must be a valid email address')
})

const optionalEmail = field<string | null>((raw) => raw === '' ? valid(null) : email.safeParse(raw).success
  ? valid(raw.trim().toLowerCase())
  : invalid('INVALID_EMAIL', 'Value must be a valid email address'))

interface ListOptions {
  email?: boolean
  unique?: boolean
}

const list = ({ email: emails = false, unique = true }: ListOptions = {}) =>
  z.string().transform((raw, ctx): string[] => {
    if (raw === '') return []

    const values: string[] = []
    const seen = new Set<string>()
    for (const item of raw.split(';')) {
      if (item === '' || item !== item.trim()) {
        addIssue(ctx, 'INVALID_LIST', 'List items must be non-empty with no whitespace around separators')
        continue
      }
      const value = emails ? item.toLowerCase() : item
      if (emails && !EMAIL_PATTERN.test(value)) {
        addIssue(ctx, 'INVALID_EMAIL', `Invalid email list item: ${item}`)
        continue
      }
      if (unique && seen.has(value)) {
        addIssue(ctx, 'DUPLICATE_LIST_ITEM', `Duplicate list item: ${value}`)
        continue
      }
      seen.add(value)
      values.push(value)
    }
    return values
  })

const parseTimestamp = (value: string): FieldResult<string> => {
  if (!TIMESTAMP_SCHEMA.safeParse(value).success) {
    return invalid('INVALID_TIMESTAMP', 'Timestamp must be an ISO 8601 date and time with a UTC offset')
  }
  return valid(new Date(value).toISOString())
}

const timestamp = field(parseTimestamp)
const optionalTimestamp = field<string | null>((value) => value === '' ? valid(null) : parseTimestamp(value))

const validHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
  } catch {
    return false
  }
}

const optionalUrl = optional(2048)
  .transform((value, ctx): string | null => {
    if (value === null) return null
    if (value !== value.trim()) {
      addIssue(ctx, 'INVALID_URL', 'URL must not contain leading or trailing whitespace')
    } else if (!validHttpUrl(value)) {
      addIssue(ctx, 'INVALID_URL', 'URL must be absolute HTTP(S), include a hostname, and contain no credentials')
    }
    return value
  })

const urlList = list({ unique: false }).superRefine((values, ctx) => {
  for (const value of values) {
    if (value.length > 2048 || !validHttpUrl(value)) {
      addIssue(ctx, 'INVALID_URL', `Invalid image URL: ${value}`)
    }
  }
})

interface AmountOptions {
  nonNegative?: boolean
  positive?: boolean
}

const parseAmount = (value: string, scale: number, options: AmountOptions = {}): FieldResult<string> => {
  if (value === '') return invalid('REQUIRED_FIELD', 'Amount is required')
  const result = parseExactAmount(value, scale)
  if (!result.success) return invalid(result.code, result.message)
  if (options.positive && result.value <= 0n) {
    return invalid('INVALID_AMOUNT', 'Amount must be greater than zero')
  }
  if (options.nonNegative && result.value < 0n) {
    return invalid('INVALID_AMOUNT', 'Amount must not be negative')
  }
  return valid(result.value.toString())
}

const amount = (scale: number, options?: AmountOptions) =>
  field<string>((value) => parseAmount(value, scale, options))
const optionalAmount = (scale: number, options?: AmountOptions) =>
  field<string | null>((value) => value === '' ? valid(null) : parseAmount(value, scale, options))
const optionalAmountOrFalse = (scale: number, options?: AmountOptions) =>
  field<string | false | null>((value) => value === ''
    ? valid(null)
    : value === 'false'
      ? valid(false)
      : parseAmount(value, scale, options))

const secondsOrFalse = field<number | false | null>((value) => value === ''
  ? valid(null)
  : value === 'false'
    ? valid(false)
    : parseInteger(value))

const coordinate = (minimum: number, maximum: number) => field<number | null>((value) => {
  if (value === '') return valid(null)
  if (!COORDINATE_PATTERN.test(value)) {
    return invalid('INVALID_COORDINATE', 'Coordinate must be a plain decimal number')
  }
  const coordinateValue = Number(value)
  return Number.isFinite(coordinateValue) && coordinateValue >= minimum && coordinateValue <= maximum
    ? valid(coordinateValue)
    : invalid('INVALID_COORDINATE', `Coordinate must be between ${minimum} and ${maximum}`)
})

const addressSchema = z.object({
  streetAddress: optional(),
  locality: optional(),
  postalCode: optional(),
  region: optional(),
  country: optional(),
})
type AddressRow = z.output<typeof addressSchema>

const toAddress = (address: AddressRow): MigrationAddress | null =>
  Object.values(address).every((value) => value === null) ? null : address

const locationSchema = z.object({
  name: optional(),
  type: optionalEnumValue(['Point']),
  longitude: coordinate(-180, 180),
  latitude: coordinate(-90, 90),
})
type LocationRow = z.output<typeof locationSchema>

const validateLocation = (location: LocationRow, ctx: IssueContext): void => {
  if (Object.values(location).every((value) => value === null)) return
  if (location.type === null) {
    addIssue(ctx, 'INVALID_ENUM', 'Value must be one of: Point', ['location', 'type'])
  }
  if (location.longitude === null) {
    addIssue(ctx, 'INVALID_COORDINATE', 'Coordinate must be a plain decimal number', ['location', 'longitude'])
  }
  if (location.latitude === null) {
    addIssue(ctx, 'INVALID_COORDINATE', 'Coordinate must be a plain decimal number', ['location', 'latitude'])
  }
}

const toLocation = (location: LocationRow): MigrationLocation | null =>
  location.type === null || location.longitude === null || location.latitude === null
    ? null
    : { ...location, type: location.type, longitude: location.longitude, latitude: location.latitude }

const contactSchema = z.object({
  phone: optional(),
  email: optionalEmail,
  telegram: optional(),
  whatsapp: optional(),
  website: optionalUrl,
})
type ContactRow = z.output<typeof contactSchema>

const toContacts = (contact: ContactRow): MigrationContact[] =>
  Object.entries(contact)
    .filter((entry): entry is [MigrationContact['type'], string] => entry[1] !== null)
    .map(([type, value]) => ({ type, value }))

const timestampOrder = (
  ctx: IssueContext,
  earlier: string | null,
  later: string | null,
  laterColumn: string,
  message = 'Update timestamp cannot precede creation timestamp',
): void => {
  if (earlier !== null && later !== null && new Date(later) < new Date(earlier)) {
    addIssue(ctx, 'INVALID_TIMESTAMP_ORDER', message, [laterColumn])
  }
}

const paymentSettingsFields = {
  allowPayments: booleanValue,
  allowPaymentRequests: booleanValue,
  allowSimplePayments: booleanValue,
  allowSimplePaymentRequests: booleanValue,
  allowQrPayments: booleanValue,
  allowQrPaymentRequests: booleanValue,
  allowMultiplePayments: booleanValue,
  allowMultiplePaymentRequests: booleanValue,
  allowTagPayments: booleanValue,
  allowTagPaymentRequests: booleanValue,
  acceptPaymentsAutomatically: booleanValue,
  allowExternalPayments: booleanValue,
  allowExternalPaymentRequests: booleanValue,
  acceptExternalPaymentsAutomatically: booleanValue,
}

const currencySettingsSchema = (scale: number) => z.object({
  defaultInitialCreditLimit: optionalAmount(scale, { nonNegative: true }),
  externalTraderCreditLimit: optionalAmount(scale, { nonNegative: true }),
  defaultInitialMaximumBalance: optionalAmountOrFalse(scale, { nonNegative: true }),
  defaultOnPaymentCreditLimit: optionalAmountOrFalse(scale, { nonNegative: true }),
  externalTraderMaximumBalance: optionalAmountOrFalse(scale, { nonNegative: true }),
  defaultAcceptPaymentsAfter: secondsOrFalse,
  defaultAcceptPaymentsWhitelist: list(),
  defaultAllowPayments: booleanValue,
  defaultAllowPaymentRequests: booleanValue,
  defaultAcceptPaymentsAutomatically: booleanValue,
  defaultAllowSimplePayments: booleanValue,
  defaultAllowSimplePaymentRequests: booleanValue,
  defaultAllowQrPayments: booleanValue,
  defaultAllowQrPaymentRequests: booleanValue,
  defaultAllowMultiplePayments: booleanValue,
  defaultAllowMultiplePaymentRequests: booleanValue,
  defaultAllowTagPayments: booleanValue,
  defaultAllowTagPaymentRequests: booleanValue,
  defaultAllowExternalPayments: booleanValue,
  defaultAllowExternalPaymentRequests: booleanValue,
  defaultAcceptExternalPaymentsAutomatically: booleanValue,
  enableExternalPayments: booleanValue,
  enableExternalPaymentRequests: booleanValue,
  enableCreditCommonsPayments: booleanValue,
  defaultHideBalance: booleanValue,
})

const accountSettingsSchema = (scale: number) => z.object({
  ...paymentSettingsFields,
  onPaymentCreditLimit: optionalAmountOrFalse(scale, { nonNegative: true }),
  acceptPaymentsAfter: secondsOrFalse,
  acceptPaymentsWhitelist: list(),
  hideBalance: booleanValue,
})

const communityRowSchema = (scale: number) => z.object({
  code: required(),
  name: required(255),
  description: z.string(),
  access: enumValue(ACCESS_VALUES),
  adminUsers: list({ email: true }),
  createdAt: timestamp,
  updatedAt: timestamp,
  imageUrl: optionalUrl,
  address: addressSchema,
  location: locationSchema,
  contact: contactSchema,
  settings: z.object({
    requireAcceptTerms: booleanValue,
    terms: optional(),
    minOffers: optionalInteger(),
    minWants: optionalInteger(),
    allowAnonymousMemberList: booleanValue,
    enableGroupEmail: booleanValue,
    defaultGroupEmailFrequency: optionalEnumValue(EMAIL_FREQUENCY_VALUES),
  }),
  currency: z.object({
    adminUser: email,
    name: required(255),
    namePlural: required(255),
    symbol: required(),
    decimals: integer({ maximum: 8 }),
    scale: integer({ maximum: 12 }),
    rateNumerator: integer({ minimum: 1, maximum: 2_147_483_647 }),
    rateDenominator: integer({ minimum: 1, maximum: 2_147_483_647 }),
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: currencySettingsSchema(scale),
  }),
}).superRefine((row, ctx) => {
  if (!/^[A-Z0-9]{4}$/.test(row.code)) {
    addIssue(ctx, 'INVALID_CODE', 'Community code must contain exactly four uppercase ASCII letters or digits', ['code'])
  }
  if (!row.adminUsers.includes(row.currency.adminUser)) {
    addIssue(ctx, 'INVALID_CURRENCY_ADMIN',
      'Currency administrator must also be a community administrator', ['currency', 'adminUser'])
  }
  const symbolLength = Array.from(row.currency.symbol).length
  if (symbolLength < 1 || symbolLength > 3) {
    addIssue(ctx, 'INVALID_VALUE', 'Currency symbol must contain between one and three characters',
      ['currency', 'symbol'])
  }
  if (row.currency.decimals > row.currency.scale) {
    addIssue(ctx, 'INVALID_CURRENCY_SCALE', 'Currency decimals cannot exceed currency scale',
      ['currency', 'decimals'])
  }
  timestampOrder(ctx, row.createdAt, row.updatedAt, 'updatedAt')
  timestampOrder(ctx, row.currency.createdAt, row.currency.updatedAt, 'currency.updatedAt')
  validateLocation(row.location, ctx)
}).transform(({ address, location, contact, currency, ...community }): MigrationCommunity => ({
  code: community.code,
  name: community.name,
  description: community.description,
  access: community.access,
  adminUsers: community.adminUsers,
  createdAt: community.createdAt,
  updatedAt: community.updatedAt,
  imageUrl: community.imageUrl,
  address: toAddress(address),
  location: toLocation(location),
  contacts: toContacts(contact),
  settings: community.settings,
  currency: {
    code: community.code,
    ...currency,
  },
}))

const userRowSchema = z.object({
  createdAt: timestamp,
  updatedAt: timestamp,
  email,
  name: optional(255),
  settings: z.object({
    language: optional(),
    notifications: z.object({
      myAccount: booleanValue,
      group: booleanValue,
    }),
    emails: z.object({
      myAccount: booleanValue,
      group: optionalEnumValue(EMAIL_FREQUENCY_VALUES),
    }),
  }),
}).superRefine((row, ctx) => timestampOrder(ctx, row.createdAt, row.updatedAt, 'updatedAt'))
  .transform((row): MigrationUser => ({
    email: row.email,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    settings: row.settings,
  }))

const memberRowSchema = (scale: number) => z.object({
  code: required(255),
  name: required(255),
  type: enumValue(['personal', 'business', 'organization']),
  status: enumValue(['draft', 'pending', 'active', 'disabled', 'suspended', 'deleted']),
  access: enumValue(ACCESS_VALUES),
  description: z.string(),
  adminUsers: list({ email: true }),
  createdAt: timestamp,
  updatedAt: timestamp,
  imageUrl: optionalUrl,
  address: addressSchema,
  location: locationSchema,
  contact: contactSchema,
  account: z.object({
    balance: optionalAmount(scale),
    creditLimit: optionalAmount(scale, { nonNegative: true }),
    createdAt: optionalTimestamp,
    updatedAt: optionalTimestamp,
    maximumBalance: optionalAmount(scale, { nonNegative: true }),
    settings: accountSettingsSchema(scale),
  }),
}).superRefine((row, ctx) => {
  if (!/^[A-Z0-9]{4}[0-9]{4}$/.test(row.code)) {
    addIssue(ctx, 'INVALID_CODE', 'Member code must be a four-character community code followed by four digits', ['code'])
  }
  timestampOrder(ctx, row.createdAt, row.updatedAt, 'updatedAt')
  validateLocation(row.location, ctx)

  if (row.status !== 'deleted' && row.adminUsers.length === 0) {
    addIssue(ctx, 'REQUIRED_FIELD', 'At least one member administrator is required', ['adminUsers'])
  }

  if (row.status === 'draft' || row.status === 'pending') {
    const accountValues: Array<[string, unknown]> = [
      ...Object.entries(row.account).filter(([property]) => property !== 'settings'),
      ...Object.entries(row.account.settings)
        .map(([property, value]): [string, unknown] => [`settings.${property}`, value]),
    ]
    for (const [property, value] of accountValues) {
      if (value !== null && (!Array.isArray(value) || value.length > 0)) {
        addIssue(ctx, 'ACCOUNT_FIELD_NOT_ALLOWED',
          'Account-only field must be blank for draft and pending members', ['account', ...property.split('.')])
      }
    }
    return
  }

  if (row.account.balance === null) {
    addIssue(ctx, 'REQUIRED_FIELD', 'Amount is required', ['account', 'balance'])
  }
  if (row.account.creditLimit === null) {
    addIssue(ctx, 'REQUIRED_FIELD', 'Amount is required', ['account', 'creditLimit'])
  }
  if (row.account.createdAt === null) {
    addIssue(ctx, 'INVALID_TIMESTAMP',
      'Timestamp must be an ISO 8601 date and time with a UTC offset', ['account', 'createdAt'])
  }
  if (row.account.updatedAt === null) {
    addIssue(ctx, 'INVALID_TIMESTAMP',
      'Timestamp must be an ISO 8601 date and time with a UTC offset', ['account', 'updatedAt'])
  }
  timestampOrder(ctx, row.account.createdAt, row.account.updatedAt, 'account.updatedAt')

  if (row.account.balance !== null && row.account.creditLimit !== null
    && BigInt(row.account.balance) < -BigInt(row.account.creditLimit)) {
    addIssue(ctx, 'ACCOUNT_LIMIT', 'Balance cannot be below the negative credit limit', ['account', 'balance'])
  }
  if (row.account.balance !== null && row.account.maximumBalance !== null
    && BigInt(row.account.balance) > BigInt(row.account.maximumBalance)) {
    addIssue(ctx, 'ACCOUNT_LIMIT', 'Balance cannot exceed the maximum balance', ['account', 'balance'])
  }
  if (row.status === 'deleted' && row.account.balance !== null && BigInt(row.account.balance) !== 0n) {
    addIssue(ctx, 'DELETED_ACCOUNT_BALANCE', 'Deleted member accounts must have a zero balance',
      ['account', 'balance'])
  }
}).transform(({ address, location, contact, ...row }): MigrationMember => {
  let account: MigrationMember['account'] = null
  if (row.status !== 'draft' && row.status !== 'pending'
    && row.account.balance !== null && row.account.creditLimit !== null
    && row.account.createdAt !== null && row.account.updatedAt !== null) {
    account = {
      code: row.code,
      status: row.status,
      owners: row.adminUsers,
      balance: row.account.balance,
      creditLimit: row.account.creditLimit,
      maximumBalance: row.account.maximumBalance,
      createdAt: row.account.createdAt,
      updatedAt: row.account.updatedAt,
      settings: row.account.settings,
    }
  }
  return {
    code: row.code,
    name: row.name,
    type: row.type,
    status: row.status,
    access: row.access,
    description: row.description,
    adminUsers: row.adminUsers,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    imageUrl: row.imageUrl,
    address: toAddress(address),
    location: toLocation(location),
    contacts: toContacts(contact),
    account,
  }
})

const transferRowSchema = (scale: number) => z.object({
  sourceKey: required(128),
  payerAccountCode: required(255),
  payeeAccountCode: required(255),
  initiatorUser: email,
  amount: amount(scale, { positive: true }),
  description: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
}).superRefine((row, ctx) => timestampOrder(ctx, row.createdAt, row.updatedAt, 'updatedAt'))
  .transform((row): MigrationTransfer => row)

const categoryRowSchema = z.object({
  code: required(255),
  name: required(255),
  description: optional(1000),
  access: enumValue(ACCESS_VALUES),
  createdAt: timestamp,
  updatedAt: timestamp,
  icon: z.object({
    type: optional(),
    value: optional(),
  }),
}).superRefine((row, ctx) => {
  timestampOrder(ctx, row.createdAt, row.updatedAt, 'updatedAt')
  if ((row.icon.type === null) !== (row.icon.value === null)) {
    addIssue(ctx, 'INVALID_FIELD_GROUP', 'Icon type and value must either both be blank or both be present',
      ['icon', row.icon.type === null ? 'type' : 'value'])
  }
}).transform((row): MigrationCategory => ({
  ...row,
  icon: row.icon.type === null || row.icon.value === null
    ? null
    : { type: row.icon.type, value: row.icon.value },
}))

const postRowSchema = z.object({
  code: required(255),
  type: enumValue(['offer', 'want']),
  memberCode: required(255),
  categoryCode: optional(255),
  title: optional(255),
  description: required(16_384),
  status: enumValue(['draft', 'published', 'hidden']),
  access: enumValue(ACCESS_VALUES),
  value: optional(255),
  fulfilledAt: optionalTimestamp,
  expiresAt: optionalTimestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  location: locationSchema,
  imageUrls: urlList,
}).superRefine((row, ctx) => {
  if (row.type === 'offer') {
    if (row.title === null) addIssue(ctx, 'REQUIRED_FIELD', 'Offers require a title', ['title'])
    if (row.fulfilledAt !== null) {
      addIssue(ctx, 'FIELD_NOT_ALLOWED', 'Offers cannot set fulfilledAt', ['fulfilledAt'])
    }
  }
  if (row.type === 'want' && row.value !== null) {
    addIssue(ctx, 'FIELD_NOT_ALLOWED', 'Wants cannot set value', ['value'])
  }
  timestampOrder(ctx, row.createdAt, row.updatedAt, 'updatedAt')
  timestampOrder(ctx, row.createdAt, row.fulfilledAt, 'fulfilledAt',
    'Fulfilment timestamp cannot precede creation')
  timestampOrder(ctx, row.createdAt, row.expiresAt, 'expiresAt', 'Expiry timestamp cannot precede creation')
  validateLocation(row.location, ctx)
}).transform((row): MigrationPost => ({
  ...row,
  location: toLocation(row.location),
}))

const parseRecord = <T>(
  schema: z.ZodType<T>,
  file: string,
  record: CsvRecord,
  errors: ErrorCollector,
): T | null => {
  const result = schema.safeParse(record.cells)
  if (result.success) return result.data

  for (const issue of result.error.issues) {
    const code = issue.code === 'custom' && typeof issue.params?.migrationCode === 'string'
      ? issue.params.migrationCode
      : 'INVALID_VALUE'
    errors.field(code, issue.message, file, record.row, issue.path.join('.'))
  }
  return null
}

const parseRecords = <T>(
  records: CsvRecord[],
  schema: z.ZodType<T>,
  file: string,
  errors: ErrorCollector,
): Located<T>[] => records.flatMap((record) => {
  const value = parseRecord(schema, file, record, errors)
  return value === null ? [] : [{ value, row: record.row }]
})

export const parseMigrationRows = (
  csv: DecodedCsvBundle,
  errors: ErrorCollector,
): ParsedMigrationRows => {
  if (csv['community.csv'].length !== 1) {
    errors.add({
      code: 'INVALID_COMMUNITY_COUNT',
      message: 'community.csv must contain exactly one data record',
      file: 'community.csv',
      row: null,
      column: null,
    })
  }

  const communityRecord = csv['community.csv'][0]
  const currency = communityRecord?.cells.currency
  const parsedScale = currency && typeof currency === 'object'
    ? integer({ maximum: 12 }).safeParse(currency.scale)
    : null
  const communityValue = communityRecord
    ? parseRecord(communityRowSchema(parsedScale?.success ? parsedScale.data : 0),
        'community.csv', communityRecord, errors)
    : null
  const community = communityValue === null || csv['community.csv'].length !== 1
    ? null
    : { value: communityValue, row: communityRecord.row }
  const scale = communityValue?.currency.scale ?? 0

  return {
    community,
    users: parseRecords(csv['users.csv'], userRowSchema, 'users.csv', errors),
    members: parseRecords(csv['members.csv'], memberRowSchema(scale), 'members.csv', errors),
    transfers: parseRecords(csv['transfers.csv'], transferRowSchema(scale), 'transfers.csv', errors),
    categories: parseRecords(csv['categories.csv'], categoryRowSchema, 'categories.csv', errors),
    posts: parseRecords(csv['posts.csv'], postRowSchema, 'posts.csv', errors),
  }
}
