import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buffer } from 'node:stream/consumers'
import { fileURLToPath } from 'node:url'
import { parse } from 'csv-parse/sync'
import { ZipFile } from 'yazl'
import { MIGRATION_BUNDLE_FILENAMES, type MigrationBundleFilename } from '../../src/features/migrations/bundle/constants'

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

const encodeCell = (cell: string): string => /[",\r\n]/.test(cell)
  ? `"${cell.replaceAll('"', '""')}"`
  : cell

export const encodeCsv = (records: string[][]): Buffer => Buffer.from(
  `${records.map((record) => record.map(encodeCell).join(',')).join('\n')}\n`,
)

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
  records[dataRow][columnIndex] = value
  mutated.set(filename, encodeCsv(records))
  return mutated
}

export const resultCodes = (result: { success: boolean, errors?: Array<{ code: string }> }): string[] =>
  result.success ? [] : result.errors!.map((error) => error.code)
