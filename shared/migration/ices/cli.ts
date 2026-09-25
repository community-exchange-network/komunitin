import { runIcesExport } from './export-cli'

try {
  await runIcesExport()
} catch (error) {
  console.error(error instanceof Error ? error.message : 'ICES export failed')
  process.exitCode = 1
}
