import { MIGRATION_PARSER_LIMITS, type MigrationParserLimits } from './constants'
import { loadMigrationBundle, type LoadedMigrationBundle } from './container'
import { decodeCsvBundle } from './csv'
import { compareErrors, ErrorCollector } from './errors'
import { normalizeImportPlan, summarizeImportPlan } from './normalization'
import { parseMigrationRows } from './schemas'
import { validateMigrationSemantics } from './semantic'
import type {
  AccountingFiles,
  MigrationBundleInput,
  MigrationParseResult,
  MigrationParserLimitOverrides,
} from './types'

/** Validate bundle structure and Social records; Accounting validates financial values during import. */
export const parseMigrationBundle = async (
  input: MigrationBundleInput,
  limitOverrides: MigrationParserLimitOverrides = {},
): Promise<MigrationParseResult> => {
  const prepared = await prepareMigrationBundle(input, limitOverrides)
  return prepared.success
    ? { success: true, plan: prepared.plan, summary: prepared.summary }
    : prepared
}

/** Unpack once and retain Accounting CSVs unchanged for the service handoff. */
export const prepareMigrationBundle = async (
  input: MigrationBundleInput,
  limitOverrides: MigrationParserLimitOverrides = {},
) => {
  const limits = { ...MIGRATION_PARSER_LIMITS, ...limitOverrides }
  const loaded = await loadMigrationBundle(input, limits)
  const parsed = parseLoadedMigrationBundle(loaded, limits)
  if (!parsed.success) return parsed

  // Successful parsing guarantees the required files exist and contain valid UTF-8.
  const accountingFiles: AccountingFiles = {
    'currency.csv': loaded.files.get('currency.csv')!.toString('utf8'),
    'accounts.csv': loaded.files.get('accounts.csv')!.toString('utf8'),
  }
  const transfers = loaded.files.get('transfers.csv')
  if (transfers) accountingFiles['transfers.csv'] = transfers.toString('utf8')

  return { ...parsed, accountingFiles }
}

const parseLoadedMigrationBundle = (
  loaded: LoadedMigrationBundle,
  limits: MigrationParserLimits,
): MigrationParseResult => {
  const errors = new ErrorCollector(limits.maxErrors)
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
  AccountingFiles,
  MigrationBundleInput,
  MigrationImportPlan,
  MigrationParseResult,
  MigrationParserLimitOverrides,
  MigrationSummary,
  MigrationValidationError,
} from './types'
