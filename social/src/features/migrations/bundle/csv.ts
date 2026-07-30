import { TextDecoder } from 'node:util'
import { parse } from 'csv-parse/sync'
import { MIGRATION_BUNDLE_FILENAMES, type MigrationBundleFilename, type MigrationParserLimits } from './constants'
import { ErrorCollector } from './errors'

export const CSV_HEADERS: Record<MigrationBundleFilename, readonly string[]> = {
  'community.csv': [
    'code', 'name', 'description', 'access', 'adminUsers', 'currency.adminUser', 'currency.name',
    'currency.namePlural', 'currency.symbol', 'currency.decimals', 'currency.scale',
    'currency.rateNumerator', 'currency.rateDenominator', 'createdAt', 'updatedAt',
    'currency.createdAt', 'currency.updatedAt', 'imageUrl', 'address.streetAddress',
    'address.locality', 'address.postalCode', 'address.region', 'address.country', 'location.name',
    'location.type', 'location.longitude', 'location.latitude', 'contact.phone', 'contact.email',
    'contact.telegram', 'contact.whatsapp', 'contact.website', 'settings.requireAcceptTerms',
    'settings.terms', 'settings.minOffers', 'settings.minWants', 'settings.allowAnonymousMemberList',
    'settings.enableGroupEmail', 'settings.defaultGroupEmailFrequency',
    'currency.settings.defaultInitialCreditLimit', 'currency.settings.externalTraderCreditLimit',
    'currency.settings.defaultInitialMaximumBalance', 'currency.settings.defaultOnPaymentCreditLimit',
    'currency.settings.externalTraderMaximumBalance', 'currency.settings.defaultAcceptPaymentsAfter',
    'currency.settings.defaultAcceptPaymentsWhitelist', 'currency.settings.defaultAllowPayments',
    'currency.settings.defaultAllowPaymentRequests',
    'currency.settings.defaultAcceptPaymentsAutomatically',
    'currency.settings.defaultAllowSimplePayments',
    'currency.settings.defaultAllowSimplePaymentRequests', 'currency.settings.defaultAllowQrPayments',
    'currency.settings.defaultAllowQrPaymentRequests',
    'currency.settings.defaultAllowMultiplePayments',
    'currency.settings.defaultAllowMultiplePaymentRequests',
    'currency.settings.defaultAllowTagPayments',
    'currency.settings.defaultAllowTagPaymentRequests',
    'currency.settings.defaultAllowExternalPayments',
    'currency.settings.defaultAllowExternalPaymentRequests',
    'currency.settings.defaultAcceptExternalPaymentsAutomatically',
    'currency.settings.enableExternalPayments', 'currency.settings.enableExternalPaymentRequests',
    'currency.settings.enableCreditCommonsPayments', 'currency.settings.defaultHideBalance',
  ],
  'users.csv': [
    'email', 'name', 'createdAt', 'updatedAt', 'settings.language',
    'settings.notifications.myAccount', 'settings.notifications.group', 'settings.emails.myAccount',
    'settings.emails.group',
  ],
  'members.csv': [
    'code', 'name', 'type', 'status', 'access', 'description', 'adminUsers', 'account.balance',
    'account.creditLimit', 'createdAt', 'updatedAt', 'account.createdAt', 'account.updatedAt',
    'account.maximumBalance', 'imageUrl', 'address.streetAddress', 'address.locality',
    'address.postalCode', 'address.region', 'address.country', 'location.name', 'location.type',
    'location.longitude', 'location.latitude', 'contact.phone', 'contact.email', 'contact.telegram',
    'contact.whatsapp', 'contact.website', 'account.settings.onPaymentCreditLimit',
    'account.settings.acceptPaymentsAfter', 'account.settings.acceptPaymentsWhitelist',
    'account.settings.allowPayments', 'account.settings.allowPaymentRequests',
    'account.settings.allowSimplePayments', 'account.settings.allowSimplePaymentRequests',
    'account.settings.allowQrPayments', 'account.settings.allowQrPaymentRequests',
    'account.settings.allowMultiplePayments', 'account.settings.allowMultiplePaymentRequests',
    'account.settings.allowTagPayments', 'account.settings.allowTagPaymentRequests',
    'account.settings.acceptPaymentsAutomatically', 'account.settings.allowExternalPayments',
    'account.settings.allowExternalPaymentRequests',
    'account.settings.acceptExternalPaymentsAutomatically', 'account.settings.hideBalance',
  ],
  'transfers.csv': [
    'sourceKey', 'payerAccountCode', 'payeeAccountCode', 'initiatorUser', 'amount',
    'description', 'createdAt', 'updatedAt',
  ],
  'categories.csv': [
    'code', 'name', 'description', 'access', 'createdAt', 'updatedAt', 'icon.type', 'icon.value',
  ],
  'posts.csv': [
    'code', 'type', 'memberCode', 'categoryCode', 'title', 'description', 'status', 'access', 'value',
    'fulfilledAt', 'expiresAt', 'createdAt', 'updatedAt', 'location.name', 'location.type',
    'location.longitude', 'location.latitude', 'imageUrls',
  ],
}

export type CsvValue = string | { [key: string]: CsvValue }

export interface CsvRecord {
  row: number
  cells: Record<string, CsvValue>
}

export type DecodedCsvBundle = Record<MigrationBundleFilename, CsvRecord[]>

const emptyCsvBundle = (): DecodedCsvBundle => ({
  'community.csv': [],
  'users.csv': [],
  'members.csv': [],
  'transfers.csv': [],
  'categories.csv': [],
  'posts.csv': [],
})

const decodeUtf8 = (filename: string, buffer: Buffer, errors: ErrorCollector): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    errors.add({
      code: 'INVALID_UTF8',
      message: 'CSV contains invalid UTF-8',
      file: filename,
      row: null,
      column: null,
    })
    return null
  }
}

const headersMatch = (actual: string[], expected: readonly string[]): boolean =>
  actual.length === expected.length
  && new Set(actual).size === actual.length
  && expected.every((header) => actual.includes(header))

const structuredCells = (headers: readonly string[], row: string[]): Record<string, CsvValue> => {
  const cells: Record<string, CsvValue> = {}
  for (const [index, header] of headers.entries()) {
    const path = header.split('.')
    let object = cells
    for (const property of path.slice(0, -1)) {
      object[property] ??= {}
      object = object[property] as Record<string, CsvValue>
    }
    object[path.at(-1)!] = row[index]
  }
  return cells
}

export const decodeCsvBundle = (
  files: Map<MigrationBundleFilename, Buffer>,
  limits: MigrationParserLimits,
  errors: ErrorCollector,
): DecodedCsvBundle => {
  const decoded = emptyCsvBundle()
  let totalRows = 0

  for (const filename of MIGRATION_BUNDLE_FILENAMES) {
    const buffer = files.get(filename)
    if (!buffer) continue
    const text = decodeUtf8(filename, buffer, errors)
    if (text === null) continue

    let records: string[][]
    try {
      records = parse(text, {
        bom: false,
        columns: false,
        delimiter: ',',
        escape: '"',
        quote: '"',
        relax_column_count: true,
        relax_quotes: false,
        skip_empty_lines: false,
      }) as string[][]
    } catch (error) {
      errors.add({
        code: 'INVALID_CSV',
        message: `Invalid RFC 4180 CSV: ${(error as Error).message}`,
        file: filename,
        row: null,
        column: null,
      })
      continue
    }

    const expectedHeaders = CSV_HEADERS[filename]
    const actualHeaders = records[0]
    if (!actualHeaders || !headersMatch(actualHeaders, expectedHeaders)) {
      const mismatch = actualHeaders?.find((header) => !expectedHeaders.includes(header))
        ?? expectedHeaders.find((header) => !actualHeaders?.includes(header))
        ?? null
      errors.add({
        code: 'INVALID_HEADER',
        message: `Header must contain exactly the documented ${filename} columns`,
        file: filename,
        row: 1,
        column: mismatch,
      })
      continue
    }

    const dataRows = records.slice(1)
    totalRows += dataRows.length
    if (totalRows > limits.maxRows) {
      errors.add({
        code: 'ROW_LIMIT_EXCEEDED',
        message: `Bundle has more than ${limits.maxRows} data rows`,
        file: filename,
        row: null,
        column: null,
      })
      break
    }

    for (let index = 0; index < dataRows.length; index += 1) {
      const row = dataRows[index]
      const recordNumber = index + 2
      if (row.length !== expectedHeaders.length) {
        errors.add({
          code: 'INVALID_COLUMN_COUNT',
          message: `Record has ${row.length} columns; expected ${expectedHeaders.length}`,
          file: filename,
          row: recordNumber,
          column: null,
        })
        continue
      }

      decoded[filename].push({
        row: recordNumber,
        cells: structuredCells(actualHeaders, row),
      })
    }
  }

  return decoded
}
