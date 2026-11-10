import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Run the ICES exporter with CLI dependencies from the caller's directory. */
export const generateIcesBundle = async (args: string[]) => {
  const script = fileURLToPath(new URL('./ices/migrate.ts', import.meta.url))
  const tsx = createRequire(import.meta.url).resolve('tsx/cli')

  const child = spawn(process.execPath, [tsx, script, ...args], { stdio: 'inherit' })
  const status = await new Promise<number>((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
  if (status !== 0) throw new Error(`ICES bundle generation exited with status ${status}`)
}
