import { TextDecoder } from 'node:util'
import { parse } from 'csv-parse/sync'
import type { MigrationBundleFilename, MigrationParserLimits } from './constants'
import type { ErrorCollector } from './errors'

const CONTACT_COLUMNS = [
  'contact.phone', 'contact.email', 'contact.telegram', 'contact.whatsapp', 'contact.website',
  'contact.instagram', 'contact.facebook', 'contact.twitter',
]

export const CSV_HEADERS = {
  'community.csv': [
    'id', 'code', 'name', 'status', 'description', 'access', 'adminUsers', 'createdAt', 'updatedAt',
    'imageUrl', 'address.streetAddress', 'address.locality', 'address.postalCode', 'address.region',
    'address.country', 'location.type', 'location.longitude', 'location.latitude',
    ...CONTACT_COLUMNS, 'settings.requireAcceptTerms', 'settings.terms', 'settings.minOffers',
    'settings.minNeeds', 'settings.allowAnonymousMemberList', 'settings.enableGroupEmail',
    'settings.defaultGroupEmailFrequency',
  ],
  'users.csv': [
    'id', 'email', 'name', 'status', 'passwordHash', 'language', 'createdAt', 'updatedAt',
  ],
  'member-users.csv': [
    'id', 'member', 'user', 'notifications.myAccount', 'notifications.group', 'emails.myAccount',
    'emails.group',
  ],
  'members.csv': [
    'id', 'code', 'name', 'type', 'status', 'access', 'description', 'createdAt', 'updatedAt',
    'imageUrl', 'address.streetAddress', 'address.locality', 'address.postalCode', 'address.region',
    'address.country', 'location.type', 'location.longitude', 'location.latitude',
    ...CONTACT_COLUMNS,
  ],
  'categories.csv': [
    'id', 'code', 'name', 'description', 'access', 'createdAt', 'updatedAt', 'icon.type', 'icon.value',
  ],
  'posts.csv': [
    'id', 'code', 'type', 'member', 'category', 'title', 'description', 'status', 'access', 'value',
    'fulfilledAt', 'expiresAt', 'createdAt', 'updatedAt', 'location.type',
    'location.longitude', 'location.latitude', 'imageUrls',
  ],
}

// Only reference columns are interpreted here; Accounting owns all other fields.
const ACCOUNTING_REFERENCES = {
  'currency.csv': ['id', 'code', 'adminUser'],
  'accounts.csv': ['id', 'code'],
  'transfers.csv': [],
}

const RETAINED_HEADERS: Record<MigrationBundleFilename, readonly string[]> = { ...CSV_HEADERS, ...ACCOUNTING_REFERENCES }

export type CsvValue = string | { [key: string]: CsvValue }

export interface CsvRecord {
  row: number
  cells: Record<string, CsvValue>
}

export type DecodedCsvBundle = Record<MigrationBundleFilename, CsvRecord[]>

const emptyCsvBundle = (): DecodedCsvBundle => ({
  'community.csv': [],
  'currency.csv': [],
  'users.csv': [],
  'member-users.csv': [],
  'members.csv': [],
  'accounts.csv': [],
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

const headersMatch = (actual: string[], expected: readonly string[] | undefined): boolean =>
  new Set(actual).size === actual.length
  && (!expected || actual.every((header) => expected.includes(header)))

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

  for (const filename of Object.keys(decoded) as MigrationBundleFilename[]) {
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

    const actualHeaders = records[0]
    const retainedHeaders = RETAINED_HEADERS[filename]
    const expectedHeaders = filename in CSV_HEADERS ? retainedHeaders : undefined
    if (!actualHeaders || !headersMatch(actualHeaders, expectedHeaders)) {
      const mismatch = actualHeaders?.find((header) => expectedHeaders && !expectedHeaders.includes(header))
        ?? actualHeaders?.find((header, index) => actualHeaders.indexOf(header) !== index)
        ?? null
      errors.add({
        code: 'INVALID_HEADER',
        message: `Header must contain only documented ${filename} columns without duplicates`,
        file: filename,
        row: 1,
        column: mismatch,
      })
      continue
    }

    const dataRows = records.slice(1)
    const columnIndexes = retainedHeaders.map(header => actualHeaders.indexOf(header))
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
      if (row.length !== actualHeaders.length) {
        errors.add({
          code: 'INVALID_COLUMN_COUNT',
          message: `Record has ${row.length} columns; expected ${actualHeaders.length}`,
          file: filename,
          row: recordNumber,
          column: null,
        })
        continue
      }

      decoded[filename].push({
        row: recordNumber,
        // Omitted columns have the same validation and defaults as blank cells.
        cells: structuredCells(retainedHeaders, columnIndexes.map(column => row[column] ?? '')),
      })
    }
  }

  return decoded
}

/** Encode UTF-8 RFC 4180 CSV without changing quoted text or line breaks. */
export const encodeCsv = (records: readonly (readonly string[])[]): Buffer => Buffer.from(
  records.map((record) => record.map((cell) => /[",\r\n]/.test(cell)
    ? `"${cell.replaceAll('"', '""')}"` : cell).join(',')).join('\r\n') + '\r\n',
)
