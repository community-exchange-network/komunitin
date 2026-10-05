import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createConnection, type RowDataPacket } from 'mysql2/promise'
import { createAllIcesMigrationBundles, createIcesMigrationBundle } from './export'
import { createIcesSanitizer, type IcesSourceUser } from './sanitize'
import { apiUrl, requiredEnv } from '../../utils'

const usage = `Usage: komunitin admin bundle ices --url <ICES site URL> (--code <CODE> | --all) --output <path>
Requires ICES_ADMIN_EMAIL, ICES_ADMIN_PASSWORD and ICES_DATABASE_URL.
--code writes one ZIP; --all writes <CODE>.zip for every community state.`

try {
  const { values } = parseArgs({ options: {
    url: { type: 'string' }, code: { type: 'string' }, all: { type: 'boolean' }, output: { type: 'string' },
    help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log(usage)
  } else {
    if (!values.url || !values.output || Boolean(values.code) === Boolean(values.all)) throw new Error(usage)
    const auth = { email: requiredEnv('ICES_ADMIN_EMAIL'), password: requiredEnv('ICES_ADMIN_PASSWORD') }
    const db = await createConnection(apiUrl(requiredEnv('ICES_DATABASE_URL')))
    try {
      // Read identities once so duplicate resolution is independent of community order.
      const [users] = await db.query<(RowDataPacket & IcesSourceUser)[]>(
        'SELECT uid, mail, pass, status, language FROM users WHERE uid <> 0 ORDER BY uid',
      )
      const onProgress = (message: string) => console.error(message)
      const options = { url: apiUrl(values.url), auth, onProgress, sanitize: createIcesSanitizer(users, onProgress) }
      const bundles = values.all
        ? createAllIcesMigrationBundles(options)
        : [await createIcesMigrationBundle({ ...options, code: values.code! })]
      if (values.all) await mkdir(values.output, { recursive: true, mode: 0o700 })
      for await (const result of bundles) {
        const output = 'code' in result ? join(values.output, `${result.code}.zip`) : values.output
        onProgress(`Writing ${output} (${result.bytes.length} bytes)`)
        await writeFile(output, result.bytes, { flag: 'wx', mode: 0o600 })
        onProgress(`Completed ${output}`)
        console.log(JSON.stringify({ output, summary: result.summary, warnings: result.warnings }, null, 2))
      }
    } finally {
      await db.end()
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ICES migration export failed')
  process.exitCode = 1
}
