import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import * as yauzl from 'yauzl'
import {
  MIGRATION_BUNDLE_FILENAMES,
  REQUIRED_MIGRATION_BUNDLE_FILENAMES,
  type MigrationBundleFilename,
  type MigrationParserLimits,
} from './constants'
import type { MigrationBundleInput, MigrationValidationError } from './types'

export interface LoadedMigrationBundle {
  files: Map<MigrationBundleFilename, Buffer>
  errors: MigrationValidationError[]
}

const allowedFilenames = new Set<string>(MIGRATION_BUNDLE_FILENAMES)

const bundleError = (code: string, message: string, file: string | null = null): MigrationValidationError => ({
  code,
  message,
  file,
  row: null,
  column: null,
})

const missingFileErrors = (names: Set<string>): MigrationValidationError[] =>
  REQUIRED_MIGRATION_BUNDLE_FILENAMES
    .filter((name) => !names.has(name))
    .map((name) => bundleError('MISSING_FILE', `Required file ${name} is missing`, name))

const validateRootFilename = (filename: string): MigrationValidationError | null => {
  if (filename.length === 0 || filename.includes('/')) {
    return bundleError('INVALID_ENTRY_PATH', `Bundle entry must be a root filename: ${filename || '<empty>'}`, filename || null)
  }
  return null
}

const readZipEntry = async (
  zip: yauzl.ZipFile,
  entry: yauzl.Entry,
  maxBytes: number,
): Promise<Buffer> => {
  const stream = await zip.openReadStreamPromise(entry)
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) {
      stream.destroy()
      throw new Error('Expanded data exceeds the configured limit')
    }
    chunks.push(buffer)
  }

  return Buffer.concat(chunks, size)
}

const loadZip = async (bytes: Uint8Array, limits: MigrationParserLimits): Promise<LoadedMigrationBundle> => {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buffer.length > limits.maxCompressedBytes) {
    return {
      files: new Map(),
      errors: [bundleError(
        'ZIP_TOO_LARGE',
        `ZIP is ${buffer.length} bytes; the limit is ${limits.maxCompressedBytes} bytes`,
      )],
    }
  }

  let zip: yauzl.ZipFile | null = null
  try {
    zip = await yauzl.fromBufferPromise(buffer, {
      autoClose: false,
      decodeStrings: true,
      strictFileNames: true,
      lazyEntries: true,
      validateEntrySizes: true,
    })

    const entries: Array<{ filename: string, entry: yauzl.Entry }> = []
    const errors: MigrationValidationError[] = []
    const names = new Set<string>()
    let expandedBytes = 0

    for await (const entry of zip.eachEntry()) {
      expandedBytes += entry.uncompressedSize
      const filename = entry.fileName

      const pathError = validateRootFilename(filename)
      if (pathError) {
        errors.push(pathError)
        continue
      }
      if (entry.isEncrypted()) {
        errors.push(bundleError('ENCRYPTED_ENTRY', `Encrypted ZIP entry is not allowed: ${filename}`, filename))
        continue
      }
      if (!entry.canDecodeFileData()) {
        errors.push(bundleError('UNSUPPORTED_ZIP_ENTRY', `Unsupported ZIP compression for ${filename}`, filename))
        continue
      }
      if (!allowedFilenames.has(filename)) {
        errors.push(bundleError('UNKNOWN_FILE', `Unknown bundle file: ${filename}`, filename))
        continue
      }
      if (names.has(filename)) {
        errors.push(bundleError('DUPLICATE_FILE', `Duplicate bundle file: ${filename}`, filename))
        continue
      }

      names.add(filename)
      entries.push({ filename, entry })
    }

    if (expandedBytes > limits.maxExpandedBytes) {
      errors.push(bundleError(
        'EXPANDED_DATA_TOO_LARGE',
        `Expanded ZIP data is ${expandedBytes} bytes; the limit is ${limits.maxExpandedBytes} bytes`,
      ))
    }
    errors.push(...missingFileErrors(names))
    if (errors.length > 0) return { files: new Map(), errors }

    const files = new Map<MigrationBundleFilename, Buffer>()
    let actualBytes = 0
    for (const { filename, entry } of entries.sort((a, b) => a.filename.localeCompare(b.filename))) {
      const data = await readZipEntry(zip, entry, limits.maxExpandedBytes - actualBytes)
      actualBytes += data.length
      files.set(filename as MigrationBundleFilename, data)
    }

    return { files, errors: [] }
  } catch (error) {
    return {
      files: new Map(),
      errors: [bundleError('INVALID_ZIP', `Unable to read ZIP: ${(error as Error).message}`)],
    }
  } finally {
    zip?.close()
  }
}

const loadDirectory = async (path: string, limits: MigrationParserLimits): Promise<LoadedMigrationBundle> => {
  try {
    const root = resolve(path)
    const rootStat = await lstat(root)
    if (!rootStat.isDirectory()) {
      return { files: new Map(), errors: [bundleError('INVALID_DIRECTORY', 'Bundle path is not a directory')] }
    }

    const directoryEntries = await readdir(root, { withFileTypes: true })
    const errors: MigrationValidationError[] = []
    const names = new Set<string>()
    const accepted: string[] = []
    let expandedBytes = 0

    for (const entry of directoryEntries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = entry.name
      if (entry.isSymbolicLink()) {
        errors.push(bundleError('SYMLINK_ENTRY', `Symbolic link is not allowed: ${filename}`, filename))
        continue
      }
      if (!entry.isFile()) {
        errors.push(bundleError('INVALID_ENTRY_PATH', `Bundle entries must be root files: ${filename}`, filename))
        continue
      }
      if (!allowedFilenames.has(filename)) {
        errors.push(bundleError('UNKNOWN_FILE', `Unknown bundle file: ${filename}`, filename))
        continue
      }

      names.add(filename)
      accepted.push(filename)
      expandedBytes += (await lstat(resolve(root, filename))).size
    }

    if (expandedBytes > limits.maxExpandedBytes) {
      errors.push(bundleError(
        'EXPANDED_DATA_TOO_LARGE',
        `Directory data is ${expandedBytes} bytes; the limit is ${limits.maxExpandedBytes} bytes`,
      ))
    }
    errors.push(...missingFileErrors(names))
    if (errors.length > 0) return { files: new Map(), errors }

    const files = new Map<MigrationBundleFilename, Buffer>()
    let actualBytes = 0
    for (const filename of accepted) {
      const data = await readFile(resolve(root, filename))
      actualBytes += data.length
      if (actualBytes > limits.maxExpandedBytes) {
        return {
          files: new Map(),
          errors: [bundleError('EXPANDED_DATA_TOO_LARGE', 'Directory data exceeds the expanded-data limit')],
        }
      }
      files.set(filename as MigrationBundleFilename, data)
    }

    return { files, errors: [] }
  } catch (error) {
    return {
      files: new Map(),
      errors: [bundleError(
        'DIRECTORY_READ_ERROR',
        `Unable to read migration directory ${basename(path)}: ${(error as Error).message}`,
      )],
    }
  }
}

export const loadMigrationBundle = (
  input: MigrationBundleInput,
  limits: MigrationParserLimits,
): Promise<LoadedMigrationBundle> => input.type === 'zip'
  ? loadZip(input.bytes, limits)
  : loadDirectory(input.path, limits)
