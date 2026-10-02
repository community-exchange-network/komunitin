import { parse } from 'csv-parse/sync'
import { buffer } from 'node:stream/consumers'
import { ZipFile } from 'yazl'
import type { Connection, RowDataPacket } from 'mysql2/promise'
import { loadMigrationBundle } from '../../../../social/src/features/migrations/bundle/container'
import { MIGRATION_PARSER_LIMITS } from '../../../../social/src/features/migrations/bundle/constants'
import { encodeCsv } from '../../../../social/src/features/migrations/bundle/csv'
import { icesUserUid } from './bundle'

type DrupalUser = RowDataPacket & { uid: number, mail: string, pass: string, status: 0 | 1 }

/** Match source credentials by the UID encoded in each ICES social UUID. */
export const addIcesPasswordHashes = async (bytes: Buffer, db: Connection, onProgress: (message: string) => void = () => {}) => {
  const { files, errors } = await loadMigrationBundle({ type: 'zip', bytes }, MIGRATION_PARSER_LIMITS)
  if (errors.length) throw new Error('Invalid migration ZIP')
  const [headers, ...users] = parse(files.get('users.csv')!, { bom: true }) as string[][]
  const emailColumn = headers.indexOf('email')
  const idColumn = headers.indexOf('id')
  if (emailColumn < 0 || idColumn < 0) throw new Error('users.csv is missing email or id')
  for (const column of ['passwordHash', 'status']) {
    if (!headers.includes(column)) headers.push(column)
  }
  const hashColumn = headers.indexOf('passwordHash')
  const statusColumn = headers.indexOf('status')
  onProgress(`Enriching ${users.length} users from the ICES database`)

  // Email is not an identity key in Drupal: shared and redacted addresses recur.
  for (let offset = 0; offset < users.length; offset += 500) {
    const batch = users.slice(offset, offset + 500)
    onProgress(`Fetching database users ${offset + 1}-${offset + batch.length} of ${users.length}`)
    const uids = batch.map((row) => icesUserUid(row[idColumn]))
    const [records] = await db.execute<DrupalUser[]>(
      `SELECT uid, mail, pass, status FROM \`users\` WHERE uid IN (${uids.map(() => '?').join(',')})`,
      uids,
    )
    const sourceUsers = new Map(records.map(record => [record.uid, record]))
    for (const [index, row] of batch.entries()) {
      const source = sourceUsers.get(uids[index])
      const email = row[emailColumn].trim().toLowerCase()
      if (!source || (email !== source.mail.trim().toLowerCase() && email !== `deleted-${source.uid}@deleted.invalid`)) {
        throw new Error(`Drupal identity mismatch at users.csv row ${offset + index + 2}`)
      }
      row[hashColumn] = source.pass
      row[statusColumn] = source.status === 1 ? 'active' : 'disabled'
    }
    onProgress(`Enriched ${offset + batch.length}/${users.length} users`)
  }
  onProgress('Creating enriched ZIP')
  files.set('users.csv', encodeCsv([headers, ...users]))
  const zip = new ZipFile()
  for (const [name, contents] of files) zip.addBuffer(contents, name)
  const contents = buffer(zip.outputStream)
  zip.end()
  return { bytes: await contents, users: users.length }
}
