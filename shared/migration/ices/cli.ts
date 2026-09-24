import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { createIcesMigrationBundle } from './export'

const usage = `Usage: pnpm migrate:ices --url <ICES site URL> --code <CODE> --output <bundle.zip> [--page-size <100>]
Credentials: ICES_ACCESS_TOKEN, or ICES_CLIENT_ID and ICES_CLIENT_SECRET.
Use a service token with the komunitin_social_read_all scope.`

try {
  const { values } = parseArgs({ options: {
    url: { type: 'string' }, code: { type: 'string' }, output: { type: 'string' },
    'page-size': { type: 'string' }, help: { type: 'boolean' },
  } })
  if (values.help) {
    console.log(usage)
  } else {
    const { ICES_ACCESS_TOKEN: accessToken, ICES_CLIENT_ID: clientId, ICES_CLIENT_SECRET: clientSecret } = process.env
    if (!values.url || !values.code || !values.output || (!accessToken && !(clientId && clientSecret))) {
      throw new Error(usage)
    }
    const result = await createIcesMigrationBundle({
      url: values.url, code: values.code,
      auth: accessToken ? { accessToken } : { clientId: clientId!, clientSecret: clientSecret! },
      pageSize: values['page-size'] === undefined ? undefined : Number(values['page-size']),
    })
    await writeFile(values.output, result.bytes, { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({ output: values.output, summary: result.summary, warnings: result.warnings }, null, 2))
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ICES export failed')
  process.exitCode = 1
}
