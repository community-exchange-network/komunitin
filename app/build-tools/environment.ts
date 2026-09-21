import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import packageJson from '../package.json' with { type: 'json' }

const readEnv = (file: string): Record<string, string> =>
  existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}

/** Shell/Docker values override .env, which overrides the selected flavor defaults. */
export function loadEnvironment(file = '.env'): Record<string, string | undefined> & { FLAVOR: string } {
  const environment = { ...readEnv(file), ...process.env }
  const flavor = environment.FLAVOR || 'komunitin'
  return {
    ...readEnv(`.env.flavor.${flavor}`),
    ...environment,
    FLAVOR: flavor,
    APP_VERSION: packageJson.version
  }
}
