import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import packageJson from '../package.json' with { type: 'json' }

const readEnv = (file: string): Record<string, string> =>
  existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}

/** Shell/Docker values override env files, limited to declared public configuration. */
export function loadEnvironment(file = '.env'): Record<string, string | undefined> & { FLAVOR: string } {
  const localEnvironment = readEnv(file)
  const flavor = process.env.FLAVOR || localEnvironment.FLAVOR || 'komunitin'
  const environment: Record<string, string | undefined> = {
    ...readEnv(`.env.flavor.${flavor}`),
    ...localEnvironment
  }
  // Filter shell env vars to only those defined either in the env files or in
  // the config.ts file, in order not to expose unrelated shell environment variables.
  const configSource = readFileSync('src/utils/config.ts', 'utf8')
  const configKeys = Array.from(configSource.matchAll(/import\.meta\.env\.([A-Z][A-Z0-9_]*)/g), match => match[1])
  for (const key of new Set([...Object.keys(environment), ...configKeys])) {
    environment[key] = process.env[key] ?? environment[key]
  }
  return {
    ...environment,
    FLAVOR: flavor,
    APP_VERSION: packageJson.version
  }
}
