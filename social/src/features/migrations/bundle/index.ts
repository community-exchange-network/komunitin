import { MIGRATION_PARSER_LIMITS, type MigrationParserLimits } from './constants'
import { loadMigrationBundle } from './container'
import { decodeCsvBundle } from './csv'
import { compareErrors, ErrorCollector } from './errors'
import { normalizeImportPlan, summarizeImportPlan } from './normalization'
import { parseMigrationRows } from './schemas'
import { validateMigrationSemantics } from './semantic'
import type {
  MigrationBundleInput,
  MigrationParseResult,
  MigrationParserLimitOverrides,
} from './types'

const withLimitOverrides = (overrides: MigrationParserLimitOverrides): MigrationParserLimits => ({
  ...MIGRATION_PARSER_LIMITS,
  ...overrides,
})

export const parseMigrationBundle = async (
  input: MigrationBundleInput,
  limitOverrides: MigrationParserLimitOverrides = {},
): Promise<MigrationParseResult> => {
  const limits = withLimitOverrides(limitOverrides)
  const errors = new ErrorCollector(limits.maxErrors)
  const loaded = await loadMigrationBundle(input, limits)
  for (const error of loaded.errors.sort(compareErrors)) errors.add(error)
  if (errors.hasErrors) return { success: false, errors: errors.result() }

  const csv = decodeCsvBundle(loaded.files, limits, errors)
  const rows = parseMigrationRows(csv, errors)
  if (errors.hasErrors) return { success: false, errors: errors.result() }

  validateMigrationSemantics(rows, errors)
  if (errors.hasErrors) return { success: false, errors: errors.result() }

  const plan = normalizeImportPlan(rows)
  return {
    success: true,
    plan,
    summary: summarizeImportPlan(plan),
  }
}

export {
  MAX_COMPRESSED_ZIP_BYTES,
  MAX_EXPANDED_CSV_BYTES,
  MAX_MIGRATION_DATA_ROWS,
  MAX_MIGRATION_ERRORS,
  MIGRATION_PARSER_LIMITS,
} from './constants'
export type { MigrationParserLimits } from './constants'
export type {
  MigrationBundleInput,
  MigrationImportPlan,
  MigrationParseResult,
  MigrationParserLimitOverrides,
  MigrationSummary,
  MigrationValidationError,
} from './types'
