import { StrKey } from '@stellar/stellar-sdk'
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { badRequest } from '../utils/error'
import { exactAmount } from './amounts'
import { CSV_HEADERS, type AccountingCsvFilename } from './format'

// Blank cells and omitted columns both mean "not supplied", including for references to existing records.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => value === '' ? undefined : value, schema.optional())

const uuid = optional(z.uuid().transform(value => value.toLowerCase()))
const timestamp = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString())
const dates = { createdAt: optional(timestamp), updatedAt: optional(timestamp) }
const integer = (max: number, min = 0) => optional(z.string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .transform(Number)
  .pipe(z.number().int().min(min).max(max)))
const boolean = optional(z.enum(['true', 'false']).transform(value => value === 'true'))
const literalFalse = z.literal('false').transform(() => false as const)
const list = optional(z.string()
  .transform(value => value.split(';'))
  .pipe(z.array(z.string().min(1).refine(value => value === value.trim()))
    .refine(values => new Set(values).size === values.length)))
const text = z.string().max(255).refine(value => value.trim().length > 0)
// Match Social and Auth's migration email contract, including Unicode addresses.
const email = z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
const stellarSecret = optional(z.string().refine(value => StrKey.isValidEd25519SecretSeed(value)))

const paymentSettings = [
  'allowPayments', 'allowPaymentRequests', 'allowSimplePayments', 'allowSimplePaymentRequests',
  'allowQrPayments', 'allowQrPaymentRequests', 'allowMultiplePayments', 'allowMultiplePaymentRequests',
  'allowTagPayments', 'allowTagPaymentRequests', 'acceptPaymentsAutomatically', 'allowExternalPayments',
  'allowExternalPaymentRequests', 'acceptExternalPaymentsAutomatically', 'hideBalance',
]
const booleanSettings = (names: string[]) =>
  Object.fromEntries(names.map(name => [`settings.${name}`, boolean]))

const amountSchema = (scale: number | undefined, nonnegative = true) => optional(z.string().transform(value => {
  if (scale === undefined) {
    throw badRequest('Monetary fields require currency.csv scale')
  }
  const amount = exactAmount(value, scale)
  if (nonnegative && amount < 0n) {
    throw badRequest('Amount must be non-negative')
  }
  // Checkpoints are JSON: retain exact scaled amounts as strings until the database/ledger boundary.
  return amount.toString()
}))

const envelope = z.strictObject({
  files: z.strictObject({
    'currency.csv': z.string(),
    'accounts.csv': z.string(),
    'transfers.csv': z.string().optional(),
  }),
  users: z.array(z.strictObject({ email, id: z.uuid().transform(value => value.toLowerCase()) })),
  members: z.array(z.strictObject({
    code: z.string().min(1).max(255),
    status: z.enum(['active', 'disabled', 'suspended', 'deleted']),
    users: z.array(email),
  })),
})

/** Validate the Social service's canonical identities and accounting-only file envelope. */
export const parseEnvelope = (input: unknown) => {
  const result = envelope.safeParse(input)
  if (!result.success) {
    throw badRequest('Invalid accounting migration envelope')
  }
  return result.data
}

const readCsv = (text: string, filename: AccountingCsvFilename) => {
  let rows: string[][]
  try {
    rows = parse(text, { bom: true, columns: false })
  } catch {
    throw badRequest(`${filename}: invalid CSV`)
  }
  const [headers, ...values] = rows
  if (!headers?.length || new Set(headers).size !== headers.length) {
    throw badRequest(`${filename}: invalid headers`)
  }
  const allowedHeaders: readonly string[] = CSV_HEADERS[filename]
  if (headers.some(header => !allowedHeaders.includes(header))) {
    throw badRequest(`${filename}: unknown column`)
  }
  return values.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
}

const parseRows = <T extends z.ZodRawShape>(
  rows: Record<string, string>[],
  filename: AccountingCsvFilename,
  fields: T,
) => {
  const schema = z.object(fields)
  return rows.map((row, index) => {
    const result = schema.safeParse(row)
    if (!result.success) {
      throw badRequest(`${filename}:${index + 2}: invalid ${result.error.issues[0].path.join('.')}`)
    }
    return result.data
  })
}

/** Read the scale before monetary settings, so every decimal is parsed with the same precision. */
export const parseCurrencyCsv = (csv: string) => {
  const rows = readCsv(csv, 'currency.csv')
  if (rows.length !== 1) {
    throw badRequest('currency.csv must have exactly one row')
  }
  const scaleResult = integer(12).safeParse(rows[0].scale)
  if (!scaleResult.success) {
    throw badRequest('Invalid currency scale')
  }
  const amount = amountSchema(scaleResult.data)
  const amountOrFalse = z.union([literalFalse, amount])
  const [currency] = parseRows(rows, 'currency.csv', {
    id: uuid,
    code: z.string().regex(/^[A-Z0-9]{4}$/),
    adminUser: optional(email),
    name: optional(text),
    namePlural: optional(text),
    symbol: optional(text.refine(value => Array.from(value).length <= 3)),
    decimals: integer(8),
    scale: integer(12),
    rateNumerator: integer(2147483647, 1),
    rateDenominator: integer(2147483647, 1),
    ...dates,
    ...booleanSettings(paymentSettings.map(name => `default${name[0].toUpperCase()}${name.slice(1)}`)),
    ...booleanSettings(['enableExternalPayments', 'enableExternalPaymentRequests', 'enableCreditCommonsPayments']),
    'settings.defaultInitialCreditLimit': amount,
    'settings.externalTraderCreditLimit': amount,
    'settings.defaultInitialMaximumBalance': amountOrFalse,
    'settings.defaultOnPaymentCreditLimit': amountOrFalse,
    'settings.externalTraderMaximumBalance': amountOrFalse,
    'settings.defaultAcceptPaymentsAfter': z.union([literalFalse, integer(Number.MAX_SAFE_INTEGER)]),
    'settings.defaultAcceptPaymentsWhitelist': list,
    stellarIssuerSecret: stellarSecret,
    stellarCreditSecret: stellarSecret,
    stellarAdminSecret: stellarSecret,
    stellarExternalIssuerSecret: stellarSecret,
    stellarExternalTraderSecret: stellarSecret,
    stellarDisabledAccountsPoolSecret: stellarSecret,
  })
  return currency
}

/** Parse account fields; ownership and cross-file references are checked by the bundle validator. */
export const parseAccountsCsv = (csv: string, scale: number | undefined) => {
  const amount = amountSchema(scale)
  return parseRows(readCsv(csv, 'accounts.csv'), 'accounts.csv', {
    id: uuid,
    code: text,
    balance: amountSchema(scale, false),
    creditLimit: amount,
    maximumBalance: amount,
    ...dates,
    stellarSecret,
    ...booleanSettings(paymentSettings),
    'settings.onPaymentCreditLimit': amount,
    'settings.acceptPaymentsAfter': integer(Number.MAX_SAFE_INTEGER),
    'settings.acceptPaymentsWhitelist': list,
  })
}

/** Historical transfers require both timestamps; they are never assigned the import time. */
export const parseTransfersCsv = (csv: string, scale: number | undefined) =>
  parseRows(readCsv(csv, 'transfers.csv'), 'transfers.csv', {
    id: uuid,
    payer: text,
    payee: text,
    user: email,
    amount: amountSchema(scale),
    description: z.string().default(''),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
