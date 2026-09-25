import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createConnection } from 'mysql2/promise'
import { addIcesPasswordHashes } from './passwords'

const usage = `Usage: pnpm passwords:ices --bundle <bundle.zip>
Database: ICES_DATABASE_URL (mysql://user:password@host:3306/database).
Replaces the bundle atomically with an owner-only ZIP containing password hashes and user statuses.`

try {
  const { values } = parseArgs({ options: { bundle: { type: 'string' }, help: { type: 'boolean' } } })
  if (values.help) {
    console.log(usage)
  } else {
    if (!values.bundle || !process.env.ICES_DATABASE_URL) throw new Error(usage)
    const path = resolve(values.bundle)
    const bytes = await readFile(path)
    const db = await createConnection(process.env.ICES_DATABASE_URL)
    try {
      const result = await addIcesPasswordHashes(bytes, db)
      // A temporary sibling ensures rename stays on the same filesystem.
      const temporary = await mkdtemp(join(dirname(path), '.ices-passwords-'))
      try {
        const output = join(temporary, 'bundle.zip')
        await writeFile(output, result.bytes, { flag: 'wx', mode: 0o600 })
        await rename(output, path)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
      console.log(JSON.stringify({ output: path, users: result.users }))
    } finally {
      await db.end()
    }
  }
} catch {
  // Driver and CSV errors can contain credentials or source rows.
  console.error(`ICES password enrichment failed; the input bundle is retained if replacement did not complete.\n${usage}`)
  process.exitCode = 1
}
