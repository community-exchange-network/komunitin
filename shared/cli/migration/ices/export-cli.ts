import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createAllIcesMigrationBundles, createIcesMigrationBundle, type IcesExportOptions } from './export'
import { apiUrl } from '../../utils'

const usage = (enrich: boolean) => `Usage: ${enrich ? 'komunitin admin bundle ices' : 'pnpm export:ices'} --url <ICES site URL> (--code <CODE> | --all) --output <path>
Credentials: ICES_ADMIN_EMAIL and ICES_ADMIN_PASSWORD for a Drupal site administrator.
--code writes one ZIP; --all writes <CODE>.zip for every community into the output directory.`

/** Share selection and output handling between API-only and sanitized exports. */
export const runIcesExport = async (sanitize?: IcesExportOptions['sanitize']) => {
  const { values } = parseArgs({ options: {
    url: { type: 'string' }, code: { type: 'string' }, all: { type: 'boolean' }, output: { type: 'string' },
    help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log(usage(Boolean(sanitize)))
    if (sanitize) console.log('This command sanitizes and enriches each ZIP from ICES_DATABASE_URL.')
  } else {
    const { ICES_ADMIN_EMAIL: email, ICES_ADMIN_PASSWORD: password } = process.env
    if (!values.url || !values.output || !email || !password || Boolean(values.code) === Boolean(values.all)) {
      throw new Error(usage(Boolean(sanitize)))
    }
    if (sanitize && !process.env.ICES_DATABASE_URL) throw new Error('Set ICES_DATABASE_URL for sanitization')
    const options = {
      url: apiUrl(values.url), auth: { email, password },
      onProgress: (message: string) => console.error(message),
      sanitize,
    }
    const bundles = values.all
      ? createAllIcesMigrationBundles(options)
      : [await createIcesMigrationBundle({ ...options, code: values.code! })]
    if (values.all) await mkdir(values.output, { recursive: true, mode: 0o700 })
    for await (const result of bundles) {
      const output = 'code' in result ? join(values.output, `${result.code}.zip`) : values.output
      console.error(`Writing ${output} (${result.bytes.length} bytes)`)
      await writeFile(output, result.bytes, { flag: 'wx', mode: 0o600 })
      console.error(`Completed ${output}`)
      console.log(JSON.stringify({ output, summary: result.summary, warnings: result.warnings }, null, 2))
    }
  }
}
