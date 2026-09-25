import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { createAllIcesMigrationBundles, createIcesMigrationBundle } from './export'

const usage = (enrich: boolean) => `Usage: ${enrich ? 'komunitin admin bundle ices' : 'pnpm export:ices'} --url <ICES site URL> (--code <CODE> | --all) --output <path> [--page-size <100>]
Credentials: ICES_ADMIN_EMAIL and ICES_ADMIN_PASSWORD for a Drupal site administrator.
--code writes one ZIP; --all writes <CODE>.zip for every community into the output directory.`

/** Share selection and output handling between API-only and enriched exports. */
export const runIcesExport = async (enrich?: (path: string) => void) => {
  const { values } = parseArgs({ options: {
    url: { type: 'string' }, code: { type: 'string' }, all: { type: 'boolean' }, output: { type: 'string' },
    'page-size': { type: 'string' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log(usage(Boolean(enrich)))
    if (enrich) console.log('This command enriches each ZIP from ICES_DATABASE_URL. Use pnpm export:ices for API-only output.')
  } else {
    const { ICES_ADMIN_EMAIL: email, ICES_ADMIN_PASSWORD: password } = process.env
    if (!values.url || !values.output || !email || !password || Boolean(values.code) === Boolean(values.all)) {
      throw new Error(usage(Boolean(enrich)))
    }
    if (enrich && !process.env.ICES_DATABASE_URL) throw new Error('Set ICES_DATABASE_URL for password enrichment')
    const options = {
      url: values.url, auth: { email, password },
      pageSize: values['page-size'] === undefined ? undefined : Number(values['page-size']),
    }
    const bundles = values.all
      ? createAllIcesMigrationBundles(options)
      : [await createIcesMigrationBundle({ ...options, code: values.code! })]
    if (values.all) await mkdir(values.output, { recursive: true, mode: 0o700 })
    for await (const result of bundles) {
      const output = 'code' in result ? join(values.output, `${result.code}.zip`) : values.output
      await writeFile(output, result.bytes, { flag: 'wx', mode: 0o600 })
      enrich?.(output)
      console.log(JSON.stringify({ output, summary: result.summary, warnings: result.warnings }, null, 2))
    }
  }
}
