import { parse } from 'csv-parse/sync'
import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'
import type { Connection, RowDataPacket } from 'mysql2/promise'
import { loadMigrationBundle } from '../../../social/src/features/migrations/bundle/container'
import { MIGRATION_PARSER_LIMITS } from '../../../social/src/features/migrations/bundle/constants'
import { encodeCsv } from '../../../social/src/features/migrations/bundle/csv'

/** Complete an API bundle from Drupal's users table, matching normalized emails. */
export const addIcesPasswordHashes = async (bytes: Buffer, db: Connection) => {
  const { files, errors } = await loadMigrationBundle({ type: 'zip', bytes }, MIGRATION_PARSER_LIMITS)
  if (errors.length) throw new Error('Invalid migration ZIP')
  const [headers, ...users] = parse(files.get('users.csv')!, { bom: true }) as string[][]
  const emailColumn = headers.indexOf('email')
  if (emailColumn < 0) throw new Error('users.csv is missing email')
  if (!headers.includes('passwordHash')) headers.push('passwordHash')
  const hashColumn = headers.indexOf('passwordHash')

  // Query only exported identities, in bounded batches. Duplicate source emails
  // must fail instead of assigning an arbitrary identity's credential.
  for (let offset = 0; offset < users.length; offset += 500) {
    const batch = users.slice(offset, offset + 500)
    const emails = batch.map((row) => row[emailColumn].trim().toLowerCase())
    const [records] = await db.execute<RowDataPacket[]>(
      `SELECT mail, pass FROM \`users\` WHERE uid <> 0 AND LOWER(TRIM(mail)) IN (${emails.map(() => '?').join(',')})`,
      emails,
    )
    const hashes = new Map<string, string>()
    for (const record of records) {
      const email = (record.mail as string).trim().toLowerCase()
      if (hashes.has(email)) throw new Error('Multiple Drupal users match an exported email')
      hashes.set(email, record.pass as string)
    }
    for (const [index, row] of batch.entries()) {
      const hash = hashes.get(emails[index])
      if (hash === undefined) throw new Error(`No Drupal user matches users.csv row ${offset + index + 2}`)
      row[hashColumn] = hash
    }
  }
  files.set('users.csv', encodeCsv([headers, ...users]))
  const zip = new ZipFile()
  for (const [name, contents] of files) zip.addBuffer(contents, name)
  const contents = buffer(zip.outputStream)
  zip.end()
  return { bytes: await contents, users: users.length }
}
