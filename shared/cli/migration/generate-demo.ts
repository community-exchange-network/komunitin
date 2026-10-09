import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Keypair } from '@stellar/stellar-sdk'
import { parse } from 'csv-parse/sync'
import { ZipFile } from 'yazl'
import { encodeCsv } from '../../../social/src/features/migrations/bundle/csv.ts'
import { requiredEnv } from '../utils.ts'

const generateKeys = async (directory: URL, seed: string) => {
  const columnsByFile = {
    'currency.csv': [
      'stellarIssuerSecret', 'stellarCreditSecret', 'stellarAdminSecret',
      'stellarExternalIssuerSecret', 'stellarExternalTraderSecret', 'stellarDisabledAccountsPoolSecret',
    ],
    'accounts.csv': ['stellarSecret'],
  }
  const files = new Map<string, Buffer>()
  for (const [name, secretColumns] of Object.entries(columnsByFile)) {
    const [headers, ...rows] = parse(await readFile(new URL(name, directory))) as string[][]
    const codeIndex = headers.indexOf('code')
    const withKeys = rows.map(row => [...row, ...secretColumns.map(column => {
      // Codes and column names keep keys stable when CSV rows or columns move.
      const bytes = createHash('sha256')
        .update(JSON.stringify(['komunitin-demo-v1', seed, row[codeIndex], column]))
        .digest()
      return Keypair.fromRawEd25519Seed(bytes).secret()
    })])
    files.set(name, encodeCsv([[...headers, ...secretColumns], ...withKeys]))
  }
  return files
}

const buildZipBundle = async (directory: URL, files: ReadonlyMap<string, Buffer>, output: string) => {
  const zip = new ZipFile()
  for (const name of (await readdir(directory)).sort()) {
    const contents = files.get(name)
    if (contents) {
      zip.addBuffer(contents, name)
    } else {
      zip.addFile(fileURLToPath(new URL(name, directory)), name)
    }
  }
  const written = pipeline(zip.outputStream, createWriteStream(output))
  zip.end()
  await written
}

/** Package the demo CSVs with repeatable Stellar keys scoped to this installation. */
export const generateDemoBundle = async (args: string[]) => {
  if (args.length !== 1) throw new Error('Usage: komunitin admin bundle demo <output.zip>')
  const seed = process.env.DEMO_RANDOM_SEED || requiredEnv('KOMUNITIN_DOMAIN')
  const directory = new URL('../../demo/bundle/', import.meta.url)
  const files = await generateKeys(directory, seed)
  await buildZipBundle(directory, files, args[0])
  console.log(`Demo bundle written to ${args[0]}`)
}
