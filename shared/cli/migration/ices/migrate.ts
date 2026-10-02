import { createConnection, type RowDataPacket } from 'mysql2/promise'
import { runIcesExport } from './export-cli'
import { createIcesSanitizer, type IcesSourceUser } from './sanitize'
import { apiUrl, requiredEnv } from '../../utils'

// Read identities once so duplicate resolution is independent of community order.
try {
  if (process.argv.includes('--help')) {
    await runIcesExport(() => {})
  } else {
    const db = await createConnection(apiUrl(requiredEnv('ICES_DATABASE_URL')))
    try {
      const [users] = await db.query<(RowDataPacket & IcesSourceUser)[]>(
        'SELECT uid, mail, pass, status, language FROM users WHERE uid <> 0 ORDER BY uid',
      )
      await runIcesExport(createIcesSanitizer(users, message => console.error(message)))
    } finally {
      await db.end()
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ICES migration export failed')
  process.exitCode = 1
}
