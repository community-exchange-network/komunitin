import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runIcesExport } from './export-cli'

const require = createRequire(import.meta.url)

// Enrich each completed API ZIP using the independent database script.
try {
  await runIcesExport((path) => {
    const script = fileURLToPath(new URL('./passwords-cli.ts', import.meta.url))
    const result = spawnSync(process.execPath, ['--import', require.resolve('tsx'), script, '--bundle', path], { stdio: 'inherit' })
    if (result.error || result.status !== 0) throw new Error(`ICES password enrichment failed for ${path}`)
  })
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ICES migration export failed')
  process.exitCode = 1
}
