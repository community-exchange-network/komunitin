import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { ZipFile } from 'yazl'
import { MIGRATION_BUNDLE_FILENAMES, type MigrationBundleFilename } from '../../src/features/migrations/bundle/constants'

import { encodeCsv } from '../../src/features/migrations/bundle/csv'
export { encodeCsv }

export const exampleDirectory = fileURLToPath(new URL('../../../shared/migration/example/', import.meta.url))

export const loadExampleFiles = async (): Promise<Map<MigrationBundleFilename, Buffer>> => {
  const files = new Map<MigrationBundleFilename, Buffer>()
  for (const filename of await readdir(exampleDirectory)) {
    files.set(filename as MigrationBundleFilename, await readFile(resolve(exampleDirectory, filename)))
  }
  return files
}

export const zipFromFiles = async (
  files: Map<MigrationBundleFilename, Buffer>,
  order: readonly string[] = MIGRATION_BUNDLE_FILENAMES,
): Promise<Buffer> => {
  const zip = new ZipFile()
  for (const filename of order) {
    const data = files.get(filename as MigrationBundleFilename)
    if (data) zip.addBuffer(data, filename)
  }
  const contents = buffer(zip.outputStream)
  zip.end()
  return contents
}

export const mutateCsv = (
  files: Map<MigrationBundleFilename, Buffer>,
  filename: MigrationBundleFilename,
  dataRow: number,
  column: string,
  value: string,
): Map<MigrationBundleFilename, Buffer> => {
  const mutated = new Map(files)
  const records = parse(files.get(filename)!.toString('utf8'), { relax_column_count: true }) as string[][]
  const columnIndex = records[0].indexOf(column)
  assert.notEqual(columnIndex, -1, `Unknown ${filename} column: ${column}`)
  records[dataRow][columnIndex] = value
  mutated.set(filename, encodeCsv(records))
  return mutated
}

export const resultCodes = (result: { success: boolean, errors?: Array<{ code: string }> }): string[] =>
  result.success ? [] : result.errors!.map((error) => error.code)

export const appendCsvRow = (
  files: Map<MigrationBundleFilename, Buffer>,
  filename: MigrationBundleFilename,
  sourceRow: number,
  overrides: Record<string, string>,
): Map<MigrationBundleFilename, Buffer> => {
  const records = parse(files.get(filename)!.toString('utf8')) as string[][]
  records.push(records[0].map((header, index) => overrides[header] ?? records[sourceRow][index]))
  return new Map(files).set(filename, encodeCsv(records))
}

/** Omit columns whose values are blank in every data row. */
export const omitBlankColumns = (files: Map<MigrationBundleFilename, Buffer>) => new Map(
  [...files].map(([filename, bytes]) => {
    const records = parse(bytes.toString('utf8')) as string[][]
    const kept = records[0].map((_, index) => index)
      .filter((index) => records.slice(1).some((row) => row[index] !== ''))
    return [filename, encodeCsv(records.map((row) => kept.map((index) => row[index])))]
  }),
)
