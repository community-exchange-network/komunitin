export const MIGRATION_BUNDLE_FILENAMES = [
  'community.csv',
  'users.csv',
  'members.csv',
  'transfers.csv',
  'categories.csv',
  'posts.csv',
] as const

export type MigrationBundleFilename = typeof MIGRATION_BUNDLE_FILENAMES[number]

export const REQUIRED_MIGRATION_BUNDLE_FILENAMES: readonly MigrationBundleFilename[] = [
  'community.csv',
  'users.csv',
  'members.csv',
  'transfers.csv',
]

export interface MigrationParserLimits {
  maxCompressedBytes: number
  maxExpandedBytes: number
  maxRows: number
  maxErrors: number
}

export const MAX_COMPRESSED_ZIP_BYTES = 20 * 1024 * 1024
export const MAX_EXPANDED_CSV_BYTES = 100 * 1024 * 1024
export const MAX_MIGRATION_DATA_ROWS = 100_000
export const MAX_MIGRATION_ERRORS = 200

export const MIGRATION_PARSER_LIMITS: Readonly<MigrationParserLimits> = {
  maxCompressedBytes: MAX_COMPRESSED_ZIP_BYTES,
  maxExpandedBytes: MAX_EXPANDED_CSV_BYTES,
  maxRows: MAX_MIGRATION_DATA_ROWS,
  maxErrors: MAX_MIGRATION_ERRORS,
}
